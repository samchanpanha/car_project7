import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

/**
 * Robust R2 Configuration parser.
 * Handles subpaths in bucket names (e.g., "cars-storage/car_list/"),
 * stripped quotes, explicit prefixes, and CDN domain normalization.
 */
export function getR2Config() {
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT?.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();

  const rawBucket = (process.env.CLOUDFLARE_R2_BUCKET || "cars-storage")
    .replace(/['"]/g, "")
    .trim();
  const [bName, ...prefixParts] = rawBucket.split("/");
  const explicitPrefix = process.env.CLOUDFLARE_R2_PREFIX?.trim();
  const parsedPrefix = prefixParts.filter(Boolean).join("/");
  const keyPrefixRaw = explicitPrefix !== undefined ? explicitPrefix : parsedPrefix;
  const keyPrefix = keyPrefixRaw
    ? keyPrefixRaw.endsWith("/")
      ? keyPrefixRaw
      : `${keyPrefixRaw}/`
    : "";

  const publicBaseUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL || "")
    .trim()
    .replace(/\/+$/, "");

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucketName: bName || "cars-storage",
    keyPrefix,
    publicBaseUrl,
  };
}

let cachedClient: S3Client | null = null;
let lastClientKey: string = "";

export function isR2Configured(): boolean {
  const cfg = getR2Config();
  return Boolean(cfg.endpoint && cfg.accessKeyId && cfg.secretAccessKey && cfg.bucketName);
}

export function getR2Client(): S3Client | null {
  if (!isR2Configured()) return null;
  const cfg = getR2Config();
  const currentKey = `${cfg.endpoint}:${cfg.accessKeyId}:${cfg.bucketName}`;

  if (!cachedClient || lastClientKey !== currentKey) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: cfg.endpoint!,
      credentials: {
        accessKeyId: cfg.accessKeyId!,
        secretAccessKey: cfg.secretAccessKey!,
      },
    });
    lastClientKey = currentKey;
  }
  return cachedClient;
}

export function getR2Bucket(): string {
  return getR2Config().bucketName;
}

export function getR2KeyPrefix(): string {
  return getR2Config().keyPrefix;
}

export function getR2PublicBaseUrl(): string {
  return getR2Config().publicBaseUrl;
}

/**
 * Upload a file buffer to Cloudflare R2.
 * Returns either the public CDN URL (e.g. `https://pub-...r2.dev/car_list/${key}`)
 * or the local proxy path `/api/uploads/${key}`.
 */
export async function uploadToR2(
  key: string,
  bytes: Buffer,
  contentType: string
): Promise<string> {
  const client = getR2Client();
  const cfg = getR2Config();
  if (!client) {
    throw new Error("Cloudflare R2 is not configured");
  }

  const cleanKey = key.replace(/^\/+/, "");
  const fullKey =
    cfg.keyPrefix && !cleanKey.startsWith(cfg.keyPrefix)
      ? `${cfg.keyPrefix}${cleanKey}`
      : cleanKey;

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucketName,
      Key: fullKey,
      Body: bytes,
      ContentType: contentType,
    })
  );

  if (cfg.publicBaseUrl) {
    return `${cfg.publicBaseUrl}/${fullKey}`;
  }
  return `/api/uploads/${cleanKey}`;
}

/**
 * Fetch an object directly from Cloudflare R2.
 * Checks both prefixed and direct keys for maximum backwards compatibility.
 */
export async function getFromR2(
  key: string
): Promise<{ body: Uint8Array; contentType?: string } | null> {
  const client = getR2Client();
  const cfg = getR2Config();
  if (!client) return null;

  const cleanKey = key.replace(/^\/+/, "");
  const candidateKeys = Array.from(
    new Set([
      cfg.keyPrefix && !cleanKey.startsWith(cfg.keyPrefix)
        ? `${cfg.keyPrefix}${cleanKey}`
        : cleanKey,
      cleanKey,
    ])
  );

  for (const candidate of candidateKeys) {
    try {
      const res = await client.send(
        new GetObjectCommand({
          Bucket: cfg.bucketName,
          Key: candidate,
        })
      );

      if (res.Body) {
        const bytes = await res.Body.transformToByteArray();
        return {
          body: bytes,
          contentType: res.ContentType,
        };
      }
    } catch (err: unknown) {
      const errorName = (err as { name?: string })?.name;
      if (errorName === "NoSuchKey" || errorName === "NotFound") {
        continue;
      }
      console.warn(`[R2] getFromR2 failed for candidate ${candidate}:`, err);
    }
  }

  return null;
}

/**
 * Check if an object exists in Cloudflare R2.
 */
export async function existsInR2(key: string): Promise<boolean> {
  const client = getR2Client();
  const cfg = getR2Config();
  if (!client) return false;

  const cleanKey = key.replace(/^\/+/, "");
  const candidateKeys = Array.from(
    new Set([
      cfg.keyPrefix && !cleanKey.startsWith(cfg.keyPrefix)
        ? `${cfg.keyPrefix}${cleanKey}`
        : cleanKey,
      cleanKey,
    ])
  );

  for (const candidate of candidateKeys) {
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: cfg.bucketName,
          Key: candidate,
        })
      );
      return true;
    } catch {
      // try next candidate
    }
  }

  return false;
}

/**
 * Check if Cloudflare R2 is reachable and healthy.
 * Probes HeadBucket, falling back to ListObjectsV2 with MaxKeys: 1
 * in case token permissions are restricted to object scopes.
 */
export async function checkR2Health(): Promise<boolean> {
  const client = getR2Client();
  const cfg = getR2Config();
  if (!client || !isR2Configured()) return false;

  try {
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucketName }));
    return true;
  } catch {
    try {
      await client.send(
        new ListObjectsV2Command({
          Bucket: cfg.bucketName,
          Prefix: cfg.keyPrefix || undefined,
          MaxKeys: 1,
        })
      );
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Count objects currently stored under the R2 bucket / prefix.
 */
export async function countR2Objects(): Promise<number> {
  const client = getR2Client();
  const cfg = getR2Config();
  if (!client || !isR2Configured()) return 0;

  try {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucketName,
        Prefix: cfg.keyPrefix || undefined,
        MaxKeys: 1000,
      })
    );
    const objects = (res.Contents || []).filter(
      (o) => o.Key && o.Key !== cfg.keyPrefix
    );
    return objects.length;
  } catch {
    return 0;
  }
}

/**
 * Detailed diagnostic check for Admin panel.
 */
export async function testR2Connection(): Promise<{
  success: boolean;
  bucket: string;
  prefix: string;
  publicUrl: string;
  objectCount: number;
  sampleObjects: string[];
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  const cfg = getR2Config();
  const client = getR2Client();

  if (!client || !isR2Configured()) {
    return {
      success: false,
      bucket: cfg.bucketName,
      prefix: cfg.keyPrefix,
      publicUrl: cfg.publicBaseUrl,
      objectCount: 0,
      sampleObjects: [],
      latencyMs: Date.now() - start,
      error: "Cloudflare R2 credentials are not configured",
    };
  }

  try {
    const listRes = await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucketName,
        Prefix: cfg.keyPrefix || undefined,
        MaxKeys: 10,
      })
    );

    const objects = (listRes.Contents || [])
      .map((o) => o.Key || "")
      .filter((k) => k && k !== cfg.keyPrefix);

    return {
      success: true,
      bucket: cfg.bucketName,
      prefix: cfg.keyPrefix,
      publicUrl: cfg.publicBaseUrl,
      objectCount: objects.length,
      sampleObjects: objects.slice(0, 5),
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      bucket: cfg.bucketName,
      prefix: cfg.keyPrefix,
      publicUrl: cfg.publicBaseUrl,
      objectCount: 0,
      sampleObjects: [],
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
