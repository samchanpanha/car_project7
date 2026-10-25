import fs from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

// Load environment variables if not already loaded
const r2Endpoint =
  process.env.CLOUDFLARE_R2_ENDPOINT ||
  "https://cb9940df321e5a167f322120e5c74070.r2.cloudflarestorage.com";
const r2AccessKey =
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
  "d3de5abfa49f01c944cc6cc9eee5a282";
const r2SecretKey =
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
  "4f2977c626ea5856833a712e08052fbc78ab4cf7ebd22b6c529bbf85bf77cf5d";
const r2Bucket = process.env.CLOUDFLARE_R2_BUCKET || "cars-storage";

const minioEndpoint = process.env.MINIO_ENDPOINT || "http://localhost:9000";
const minioAccessKey = process.env.MINIO_ACCESS_KEY || "minioadmin";
const minioSecretKey = process.env.MINIO_SECRET_KEY || "minioadmin";
const minioBuckets = ["khlan-public", "khlan-private"];

const r2Client = new S3Client({
  region: "auto",
  endpoint: r2Endpoint,
  credentials: {
    accessKeyId: r2AccessKey,
    secretAccessKey: r2SecretKey,
  },
});

const minioClient = new S3Client({
  region: "us-east-1",
  endpoint: minioEndpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: minioAccessKey,
    secretAccessKey: minioSecretKey,
  },
});

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

async function doesObjectExistInR2(key: string): Promise<boolean> {
  try {
    await r2Client.send(
      new HeadObjectCommand({
        Bucket: r2Bucket,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

async function migrateMinioBucket(bucket: string) {
  console.log(`\n📦 Checking MinIO bucket: ${bucket}`);
  let continuationToken: string | undefined;
  let totalObjects = 0;
  let migratedObjects = 0;
  let skippedObjects = 0;
  let errorCount = 0;

  try {
    do {
      const listRes = await minioClient.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
        })
      );

      const items = listRes.Contents || [];
      totalObjects += items.length;

      for (const item of items) {
        if (!item.Key) continue;
        const key = item.Key;

        try {
          const exists = await doesObjectExistInR2(key);
          if (exists) {
            console.log(`  ⏭️  Skipping existing object in R2: ${key}`);
            skippedObjects++;
            continue;
          }

          console.log(`  ⬇️  Downloading from MinIO: ${key} (${item.Size ?? 0} bytes)`);
          const getRes = await minioClient.send(
            new GetObjectCommand({
              Bucket: bucket,
              Key: key,
            })
          );

          if (!getRes.Body) {
            console.warn(`  ⚠️ Empty body for ${key}`);
            continue;
          }

          const bytes = await getRes.Body.transformToByteArray();
          const ext = key.split(".").pop()?.toLowerCase() || "";
          const contentType = getRes.ContentType || MIME_BY_EXT[ext] || "application/octet-stream";

          console.log(`  ⬆️  Uploading to Cloudflare R2 [${r2Bucket}]: ${key}`);
          await r2Client.send(
            new PutObjectCommand({
              Bucket: r2Bucket,
              Key: key,
              Body: Buffer.from(bytes),
              ContentType: contentType,
            })
          );

          migratedObjects++;
          console.log(`  ✅ Successfully migrated: ${key}`);
        } catch (err) {
          errorCount++;
          console.error(`  ❌ Failed migrating ${key}:`, err);
        }
      }

      continuationToken = listRes.NextContinuationToken;
    } while (continuationToken);

    console.log(
      `📊 Summary for MinIO bucket [${bucket}]: Total=${totalObjects}, Migrated=${migratedObjects}, Skipped=${skippedObjects}, Errors=${errorCount}`
    );
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "ECONNREFUSED" || (err as Error).message?.includes("ECONNREFUSED")) {
      console.log(`ℹ️  MinIO service is currently unreachable at ${minioEndpoint} (skipping live MinIO sync)`);
    } else {
      console.warn(`⚠️ Error reading MinIO bucket ${bucket}:`, (err as Error).message);
    }
  }
}

async function migrateLocalDiskUploads() {
  const localUploadDir = path.join(process.cwd(), "uploads");
  console.log(`\n📁 Checking local disk uploads directory: ${localUploadDir}`);

  try {
    const files = await fs.readdir(localUploadDir);
    let count = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of files) {
      if (file.startsWith(".")) continue;
      const filePath = path.join(localUploadDir, file);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;

      try {
        const exists = await doesObjectExistInR2(file);
        if (exists) {
          skipped++;
          continue;
        }

        const buf = await fs.readFile(filePath);
        const ext = file.split(".").pop()?.toLowerCase() || "";
        const contentType = MIME_BY_EXT[ext] || "application/octet-stream";

        console.log(`  ⬆️ Uploading local disk file to Cloudflare R2: ${file}`);
        await r2Client.send(
          new PutObjectCommand({
            Bucket: r2Bucket,
            Key: file,
            Body: buf,
            ContentType: contentType,
          })
        );
        count++;
        console.log(`  ✅ Migrated local file: ${file}`);
      } catch (err) {
        errors++;
        console.error(`  ❌ Failed uploading local file ${file}:`, err);
      }
    }

    console.log(`📊 Local disk uploads summary: Uploaded=${count}, Skipped=${skipped}, Errors=${errors}`);
  } catch {
    console.log(`ℹ️ No local disk uploads to migrate or directory empty.`);
  }
}

async function verifyR2Connection() {
  console.log(`🔌 Verifying Cloudflare R2 connection to bucket [${r2Bucket}] at ${r2Endpoint}...`);
  try {
    const res = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: r2Bucket,
        MaxKeys: 5,
      })
    );
    const count = res.KeyCount ?? 0;
    console.log(`🎉 Cloudflare R2 connected successfully! Current objects in bucket: ${count}`);
    if (res.Contents && res.Contents.length > 0) {
      console.log(`Sample objects in bucket:`);
      for (const obj of res.Contents) {
        console.log(`  - ${obj.Key} (${obj.Size} bytes)`);
      }
    }
    return true;
  } catch (err) {
    console.error(`❌ Cloudflare R2 connection failed:`, err);
    return false;
  }
}

async function main() {
  console.log("=================================================");
  console.log("   KhLan MinIO ➔ Cloudflare R2 Migration Tool    ");
  console.log("=================================================");
  console.log(`Target R2 Bucket: ${r2Bucket}`);
  console.log(`Target R2 Endpoint: ${r2Endpoint}\n`);

  const ok = await verifyR2Connection();
  if (!ok) {
    console.error("Aborting migration: Cloudflare R2 is unreachable or credentials invalid.");
    process.exit(1);
  }

  for (const bucket of minioBuckets) {
    await migrateMinioBucket(bucket);
  }

  await migrateLocalDiskUploads();

  console.log("\n=================================================");
  console.log("   Migration check completed successfully!       ");
  console.log("=================================================");
}

main().catch((err) => {
  console.error("Migration fatal error:", err);
  process.exit(1);
});
