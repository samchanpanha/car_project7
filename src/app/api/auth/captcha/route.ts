import { NextResponse } from "next/server";
import { createCaptchaChallenge } from "@/lib/captcha";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/auth/captcha — issue a new Security Verification challenge. */
export async function GET(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    try {
      rateLimit(`captcha:new:${ip}`, 30, 60 * 1000);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 429 });
    }
    return NextResponse.json(createCaptchaChallenge());
  } catch (err) {
    console.error("[api/auth/captcha] GET failed:", err);
    return NextResponse.json({ error: "Failed to create captcha" }, { status: 500 });
  }
}
