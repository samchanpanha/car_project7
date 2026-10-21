import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR, isSafeUploadName, uploadMimeByName } from "@/lib/uploads";

export const dynamic = "force-dynamic";

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
  try {
    const buf = await fs.readFile(path.join(UPLOAD_DIR, file));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": uploadMimeByName(file),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
