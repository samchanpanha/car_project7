import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";

const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET || "cars-storage";
const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim().replace(/\/+$/, "");

let s3ClientInstance: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(endpoint && accessKeyId && secretAccessKey && bucketName);
}

export function getR2Client(): S3Client | null {
  if (!isR2Configured()) return null;
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: "auto",
      endpoint: endpoint!,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });
  }
  return s3ClientInstance;
}

export function getR2Bucket(): string {
  return bucketName;
}

/**
 * Upload a file buffer to Cloudflare R2.
 * Returns either the public URL (if CLOUDFLARE_R2_PUBLIC_URL is set) or the local proxy path `/api/uploads/${key}`.
 */
export async function uploadToR2(
  key: string,
  bytes: Buffer,
  contentType: string
): Promise<string> {
  const client = getR2Client();
  if (!client) {
    throw new Error("Cloudflare R2 is not configured");
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    })
  );

  if (publicBaseUrl) {
    return `${publicBaseUrl}/${key}`;
  }
  return `/api/uploads/${key}`;
}

/**
 * Fetch an object directly from Cloudflare R2.
 */
export async function getFromR2(
  key: string
): Promise<{ body: Uint8Array; contentType?: string } | null> {
  const client = getR2Client();
  if (!client) return null;

  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );

    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return {
      body: bytes,
      contentType: res.ContentType,
    };
  } catch (err: unknown) {
    const errorName = (err as { name?: string })?.name;
    if (errorName === "NoSuchKey" || errorName === "NotFound") {
      return null;
    }
    console.error(`[R2] getFromR2 failed for key ${key}:`, err);
    return null;
  }
}

/**
 * Check if an object exists in Cloudflare R2.
 */
export async function existsInR2(key: string): Promise<boolean> {
  const client = getR2Client();
  if (!client) return false;

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Cloudflare R2 is reachable and healthy.
 */
export async function checkR2Health(): Promise<boolean> {
  const client = getR2Client();
  if (!client) return false;
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    return true;
  } catch {
    return false;
  }
}

