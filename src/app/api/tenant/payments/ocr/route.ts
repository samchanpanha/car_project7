import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ocrSchema = z.object({
  image: z.string().trim().max(10_000_000, "Image is too large (max ~8 MB)"),
  plan: z.string().default("PRO"),
  cycle: z.string().default("MONTHLY"),
  currency: z.string().default("USD"),
  enteredRef: z.string().trim().max(80).optional(),
});

export async function POST(req: Request) {
  try {
    const { user } = await requireTenantMember();
    rateLimit(`payments:ocr:${user.id}`, 20, 60_000);

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = ocrSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid image or plan payload" }, { status: 400 });
    }

    // Forward to high-performance Spring Boot 3.4 Java 21 OCR engine
    const backendCandidates = [
      process.env.BACKEND_URL,
      "http://backend:8080",
      "http://khlan-backend:8080",
      "http://127.0.0.1:8080",
    ].filter(Boolean) as string[];

    let lastError: Error | null = null;
    for (const backendUrl of backendCandidates) {
      try {
        const backendRes = await fetch(`${backendUrl}/api/tenant/payments/ocr`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(req.headers.get("x-khlan-session") ? { "x-khlan-session": req.headers.get("x-khlan-session")! } : {}),
            ...(req.headers.get("cookie") ? { cookie: req.headers.get("cookie")! } : {}),
          },
          body: JSON.stringify(parsed.data),
          signal: AbortSignal.timeout(15_000),
        });

        const data = await backendRes.json().catch(() => null);
        if (backendRes.ok && data) {
          return NextResponse.json(data, { status: 200 });
        }
        if (data && (data.message || data.error)) {
          return NextResponse.json({ error: data.message || data.error }, { status: backendRes.status || 400 });
        }
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }

    console.error("[OCR Forward] Failed to connect to Spring Boot backend OCR:", lastError);
    return NextResponse.json(
      { error: "Backend OCR service is temporarily unavailable. Please try again or enter Trx ID manually." },
      { status: 503 }
    );
  } catch (err) {
    return toErrorResponse(err, "api/tenant/payments/ocr POST", "Failed to process receipt image");
  }
}
