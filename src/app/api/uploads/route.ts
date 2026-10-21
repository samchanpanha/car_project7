import { NextResponse } from "next/server";
import { z } from "zod";
import { isGuestRequest } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { parseFileDataUrl, saveUploadImage } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // Downscaled image / raw PDF data URL produced client-side (lib/image-client
  // for photos, FileReader for document PDFs).
  dataUrl: z.string().min(30).max(5_500_000),
});

/**
 * POST /api/uploads — store one file (car photo or vehicle-document PDF) and
 * return its permanent public URL. Signed-in users only; guests get 401.
 */
export async function POST(req: Request) {
  try {
    if (await isGuestRequest()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    rateLimit("uploads", 120, 60_000);

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid upload payload" }, { status: 400 });
    }

    const file = parseFileDataUrl(parsed.data.dataUrl);
    if (!file) {
      return NextResponse.json(
        { error: "Unsupported or oversized file — use JPEG/PNG/WebP/PDF up to 3MB" },
        { status: 400 },
      );
    }

    const url = await saveUploadImage(file.bytes, file.mime);
    return NextResponse.json({ url }, { status: 201 });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      return NextResponse.json({ error: (err as Error).message }, { status: 429 });
    }
    console.error("[api/uploads] POST failed:", err);
    return NextResponse.json({ error: "Failed to store upload" }, { status: 500 });
  }
}
