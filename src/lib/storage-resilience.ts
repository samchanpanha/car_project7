import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import {
  isR2Configured,
  uploadToR2,
  checkR2Health,
  getFromR2,
  getR2Config,
  countR2Objects,
} from "@/lib/r2-client";
import {
  isMinioConfigured,
  uploadToMinio,
  getFromMinio,
  checkMinioHealth,
} from "@/lib/minio-client";

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/**
 * Resilient upload function:
 * 1. Attempts Cloudflare R2 upload (primary).
 * 2. If R2 fails or throws, automatically falls back to MinIO reserved storage and local disk.
 * 3. Records a pending sync item in db.pendingStorageSync so the Admin can sync to R2 later.
 */
export async function saveWithStorageFailover(
  bytes: Buffer,
  mime: string,
  explicitName?: string
): Promise<string> {
  const ext = EXT_BY_MIME[mime] || "jpg";
  const name = explicitName || `${crypto.randomUUID()}.${ext}`;

  // 1. Try Cloudflare R2 first
  if (isR2Configured()) {
    try {
      const r2Url = await uploadToR2(name, bytes, mime);

      // Async local cache for faster reads / local fallback
      fs.mkdir(UPLOAD_DIR, { recursive: true })
        .then(() => fs.writeFile(path.join(UPLOAD_DIR, name), bytes))
        .catch(() => {});

      return r2Url;
    } catch (r2Err) {
      console.warn(
        `[StorageFailover] Cloudflare R2 upload failed for ${name}, initiating fallback to MinIO reserved storage:`,
        r2Err
      );
    }
  }

  // 2. Fallback to MinIO reserved storage & local disk
  let savedToMinio = false;
  if (isMinioConfigured()) {
    try {
      await uploadToMinio(name, bytes, mime);
      savedToMinio = true;
    } catch (minioErr) {
      console.warn(`[StorageFailover] MinIO fallback upload also failed for ${name}:`, minioErr);
    }
  }

  // Always write to local disk as a safe baseline
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, name), bytes);

  // 3. Record pending sync item in DB
  try {
    await db.pendingStorageSync.upsert({
      where: { fileName: name },
      create: {
        fileName: name,
        mimeType: mime,
        byteSize: bytes.length,
        source: savedToMinio ? "MINIO" : "LOCAL",
        status: "PENDING",
      },
      update: {
        status: "PENDING",
        source: savedToMinio ? "MINIO" : "LOCAL",
        error: null,
      },
    });
  } catch (dbErr) {
    console.error("[StorageFailover] Failed recording pendingStorageSync:", dbErr);
  }

  return `/api/uploads/${name}`;
}


export interface StorageStatusDTO {
  r2Configured: boolean;
  r2Healthy: boolean;
  r2Bucket?: string;
  r2Prefix?: string;
  r2PublicUrl?: string;
  r2ObjectCount?: number;
  minioConfigured: boolean;
  minioHealthy: boolean;
  pendingCount: number;
  pendingFiles: Array<{
    id: string;
    fileName: string;
    byteSize: number;
    mimeType: string;
    source: string;
    createdAt: string;
  }>;
}

/**
 * Get the current health and status of Cloudflare R2, MinIO, and pending sync files.
 */
export async function getStorageResilienceStatus(): Promise<StorageStatusDTO> {
  const r2Cfg = getR2Config();
  const [r2Healthy, minioHealthy, r2ObjectCount, pendingList] = await Promise.all([
    checkR2Health().catch(() => false),
    checkMinioHealth().catch(() => false),
    countR2Objects().catch(() => 0),
    db.pendingStorageSync
      .findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
      .catch(() => []),
  ]);

  return {
    r2Configured: isR2Configured(),
    r2Healthy,
    r2Bucket: r2Cfg.bucketName,
    r2Prefix: r2Cfg.keyPrefix,
    r2PublicUrl: r2Cfg.publicBaseUrl,
    r2ObjectCount,
    minioConfigured: isMinioConfigured(),
    minioHealthy,
    pendingCount: pendingList.length,
    pendingFiles: pendingList.map((p) => ({
      id: p.id,
      fileName: p.fileName,
      byteSize: p.byteSize,
      mimeType: p.mimeType,
      source: p.source,
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

/**
 * Synchronize all pending files from MinIO / local disk to Cloudflare R2.
 */
export async function syncPendingFilesToR2(): Promise<{
  total: number;
  synced: number;
  failed: number;
  errors: string[];
}> {
  const pending = await db.pendingStorageSync.findMany({
    where: { status: "PENDING" },
  });

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of pending) {
    try {
      let fileBytes: Buffer | null = null;

      // 1. Try reading from MinIO
      if (item.source === "MINIO" || isMinioConfigured()) {
        const minioObj = await getFromMinio(item.fileName);
        if (minioObj && minioObj.body) {
          fileBytes = Buffer.from(minioObj.body);
        }
      }

      // 2. If not found in MinIO, try reading from local disk
      if (!fileBytes) {
        const localPath = path.join(UPLOAD_DIR, item.fileName);
        try {
          fileBytes = await fs.readFile(localPath);
        } catch {
          // not found locally
        }
      }

      if (!fileBytes) {
        throw new Error(`File ${item.fileName} could not be retrieved from MinIO or local disk`);
      }

      // 3. Upload to Cloudflare R2
      await uploadToR2(item.fileName, fileBytes, item.mimeType);

      // 4. Mark synced in DB
      await db.pendingStorageSync.update({
        where: { id: item.id },
        data: {
          status: "SYNCED",
          syncedAt: new Date(),
          error: null,
        },
      });

      synced++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${item.fileName}: ${message}`);
      await db.pendingStorageSync.update({
        where: { id: item.id },
        data: {
          error: message,
        },
      }).catch(() => {});
    }
  }

  return {
    total: pending.length,
    synced,
    failed,
    errors,
  };
}
