import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";

// MinIO configuration — fallback/reserved object storage
const minioEndpoint =
  process.env.MINIO_ENDPOINT ||
  (process.env.NODE_ENV === "production" ? "http://minio:9000" : "http://localhost:9000");
const accessKeyId = process.env.MINIO_ACCESS_KEY || "minioadmin";
const secretAccessKey = process.env.MINIO_SECRET_KEY || "minioadmin";
const bucketName = process.env.MINIO_BUCKET || "cars-storage";

let minioClientInstance: S3Client | null = null;
let bucketVerified = false;

export function isMinioConfigured(): boolean {
  return Boolean(minioEndpoint && accessKeyId && secretAccessKey && bucketName);
}

export function getMinioClient(): S3Client | null {
  if (!isMinioConfigured()) return null;
  if (!minioClientInstance) {
    minioClientInstance = new S3Client({
      region: "us-east-1",
      endpoint: minioEndpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }
  return minioClientInstance;
}

export function getMinioBucket(): string {
  return bucketName;
}

/**
 * Ensure the MinIO reserved bucket exists.
 */
export async function ensureMinioBucket(): Promise<void> {
  if (bucketVerified) return;
  const client = getMinioClient();
  if (!client) return;

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    bucketVerified = true;
  } catch (err: unknown) {
    const errorName = (err as { name?: string })?.name;
    if (errorName === "NotFound" || errorName === "NoSuchBucket") {
      try {
        await client.send(new CreateBucketCommand({ Bucket: bucketName }));
        bucketVerified = true;
      } catch (createErr) {
        console.warn("[MinIO] Bucket auto-creation failed (may already exist):", createErr);
      }
    }
  }
}

/**
 * Upload a file buffer to MinIO reserved storage.
 */
export async function uploadToMinio(
  key: string,
  bytes: Buffer,
  contentType: string
): Promise<string> {
  const client = getMinioClient();
  if (!client) {
    throw new Error("MinIO storage is not configured");
  }

  await ensureMinioBucket();

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    })
  );

  return `/api/uploads/${key}`;
}

/**
 * Fetch an object directly from MinIO reserved storage.
 */
export async function getFromMinio(
  key: string
): Promise<{ body: Uint8Array; contentType?: string } | null> {
  const client = getMinioClient();
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
    console.warn(`[MinIO] getFromMinio failed for key ${key}:`, err);
    return null;
  }
}

/**
 * Test connectivity to MinIO.
 */
export async function checkMinioHealth(): Promise<boolean> {
  const client = getMinioClient();
  if (!client) return false;
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    return true;
  } catch {
    return false;
  }
}
