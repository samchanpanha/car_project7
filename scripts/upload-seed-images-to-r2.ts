import fs from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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
const r2PublicUrl = (
  process.env.CLOUDFLARE_R2_PUBLIC_URL ||
  "https://pub-d32806cd92a44955a3772e3e6c2369a5.r2.dev"
).replace(/\/$/, "");

const r2Client = new S3Client({
  region: "auto",
  endpoint: r2Endpoint,
  credentials: {
    accessKeyId: r2AccessKey,
    secretAccessKey: r2SecretKey,
  },
});

const CAR_SOURCES: Record<string, string[]> = {
  prado: [
    "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1551830820-330a71b99659?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1200&auto=format&fit=crop&q=85",
  ],
  lexus: [
    "https://images.unsplash.com/photo-1508974239320-0a029497e820?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1563720223185-11003d516935?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1617788138017-80ad40651399?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=1200&auto=format&fit=crop&q=85",
  ],
  revo: [
    "https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1584345604476-8ec5e12e42dd?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=1200&auto=format&fit=crop&q=85",
  ],
  crv: [
    "https://images.unsplash.com/photo-1568844293986-8d0400bd4745?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1590362891991-f776e747a588?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1200&auto=format&fit=crop&q=85",
  ],
  camry: [
    "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=1200&auto=format&fit=crop&q=85",
  ],
  ranger: [
    "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1563720360172-67b8f3dce741?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=1200&auto=format&fit=crop&q=85",
  ],
  tucson: [
    "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1200&auto=format&fit=crop&q=85",
  ],
  carnival: [
    "https://images.unsplash.com/photo-1617788138017-80ad40651399?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=1200&auto=format&fit=crop&q=85",
  ],
  vellfire: [
    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1590362891991-f776e747a588?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=1200&auto=format&fit=crop&q=85",
  ],
  cclass: [
    "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=1200&auto=format&fit=crop&q=85",
  ],
  civic: [
    "https://images.unsplash.com/photo-1590362891991-f776e747a588?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1200&auto=format&fit=crop&q=85",
  ],
  fortuner: [
    "https://images.unsplash.com/photo-1551830820-330a71b99659?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=1200&auto=format&fit=crop&q=85",
  ],
  accent: [
    "https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1200&auto=format&fit=crop&q=85",
  ],
  cx5: [
    "https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&auto=format&fit=crop&q=85",
    "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=1200&auto=format&fit=crop&q=85",
  ],
};

const LOCAL_SEED_FILES: Record<string, string> = {
  honda_dream: "public/images/seed/honda_dream.jpg",
  honda_scoopy: "public/images/seed/honda_scoopy.jpg",
  oem_brake_pads: "public/images/seed/oem_brake_pads.jpg",
  motorcycle_parts_kit: "public/images/seed/motorcycle_parts_kit.jpg",
};

async function main() {
  console.log("Starting vehicle images upload to Cloudflare R2...");
  const finalSeedImages: Record<string, string[]> = {};

  // 1. Process car images
  for (const [slug, urls] of Object.entries(CAR_SOURCES)) {
    console.log(`Processing car slug: ${slug} (${urls.length} photos)...`);
    finalSeedImages[slug] = [];
    const localDir = path.join(process.cwd(), "public", "images", "seed", "vehicles", slug);
    await fs.mkdir(localDir, { recursive: true });

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const key = `seed/vehicles/${slug}/${slug}_${i + 1}.jpg`;
      const localFilePath = path.join(localDir, `${slug}_${i + 1}.jpg`);

      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());

        // Save local backup copy
        await fs.writeFile(localFilePath, buffer);

        // Upload to R2
        await r2Client.send(
          new PutObjectCommand({
            Bucket: r2Bucket,
            Key: key,
            Body: buffer,
            ContentType: "image/jpeg",
          })
        );

        const publicUrl = `${r2PublicUrl}/${key}`;
        finalSeedImages[slug].push(publicUrl);
        console.log(`  -> Uploaded ${key} (${buffer.length} bytes)`);
      } catch (err: any) {
        console.error(`  x Error uploading ${key}:`, err.message);
        // Fallback to local path if upload fails
        finalSeedImages[slug].push(`/images/seed/vehicles/${slug}/${slug}_${i + 1}.jpg`);
      }
    }
  }

  // 2. Process local motorcycle & spare parts files
  for (const [slug, localRelPath] of Object.entries(LOCAL_SEED_FILES)) {
    console.log(`Processing local asset: ${slug}...`);
    finalSeedImages[slug] = [];
    const fullPath = path.join(process.cwd(), localRelPath);
    const key = `seed/vehicles/${slug}/${path.basename(localRelPath)}`;

    try {
      const buffer = await fs.readFile(fullPath);
      await r2Client.send(
        new PutObjectCommand({
          Bucket: r2Bucket,
          Key: key,
          Body: buffer,
          ContentType: "image/jpeg",
        })
      );
      const publicUrl = `${r2PublicUrl}/${key}`;
      finalSeedImages[slug].push(publicUrl);
      console.log(`  -> Uploaded ${key} (${buffer.length} bytes)`);
    } catch (err: any) {
      console.error(`  x Error reading/uploading ${key}:`, err.message);
      finalSeedImages[slug].push(`/${localRelPath.replace(/^public\//, "")}`);
    }
  }

  // 3. Write updated seed-images.json
  const seedImagesJsonPath = path.join(process.cwd(), "prisma", "seed-images.json");
  await fs.writeFile(seedImagesJsonPath, JSON.stringify(finalSeedImages, null, 2) + "\n", "utf8");
  console.log(`\nSuccessfully wrote updated ${seedImagesJsonPath}`);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
