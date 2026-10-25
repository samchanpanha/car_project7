import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR, isSafeUploadName, uploadMimeByName } from "@/lib/uploads";

export const dynamic = "force-dynamic";

import { isR2Configured, getFromR2 } from "@/lib/r2-client";

/**
 * GET /api/uploads/[file] — serve a stored upload. Public (images appear on
 * public listing pages); filenames are server-generated UUIDs so the
 * strict-name check below fully prevents path traversal.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!isSafeUploadName(file)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 1. Try serving from local disk cache if present
  try {
    const buf = await fs.readFile(path.join(UPLOAD_DIR, file));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": uploadMimeByName(file),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    // Not found on local disk, check Cloudflare R2
  }

  // 2. Fall back to Cloudflare R2
  if (isR2Configured()) {
    try {
      const r2Obj = (await getFromR2(file)) || (await getFromR2(`vehicles/${file}`));
      if (r2Obj) {
        return new Response(Buffer.from(r2Obj.body), {
          headers: {
            "Content-Type": r2Obj.contentType || uploadMimeByName(file),
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    } catch (err) {
      console.error(`[GET /api/uploads/${file}] R2 fetch error:`, err);
    }
  }

  // 3. Fall back to MinIO reserved storage
  try {
    const { isMinioConfigured, getFromMinio } = await import("@/lib/minio-client");
    if (isMinioConfigured()) {
      const minioObj = (await getFromMinio(file)) || (await getFromMinio(`vehicles/${file}`));
      if (minioObj) {
        return new Response(Buffer.from(minioObj.body), {
          headers: {
            "Content-Type": minioObj.contentType || uploadMimeByName(file),
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }
  } catch (err) {
    console.error(`[GET /api/uploads/${file}] MinIO fetch error:`, err);
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
