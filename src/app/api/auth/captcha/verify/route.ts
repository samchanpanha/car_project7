import { NextResponse } from "next/server";
import { z } from "zod";
import { issueCaptchaToken, verifyCaptchaAnswer } from "@/lib/captcha";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const verifySchema = z.object({
  id: z.string().min(8).max(64),
  /** the letters clicked, in click order, e.g. "CARS" */
  sequence: z.string().regex(/^[A-Za-z]{3,8}$/, "sequence must be 3-8 letters"),
});

/** POST /api/auth/captcha/verify — check the clicked order and mint a
 *  single-use captchaToken for login/registration. */
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    try {
      rateLimit(`captcha:verify:${ip}`, 30, 60 * 1000);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 429 });
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = verifySchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `${first?.path.join(".") ?? "body"}: ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    if (!verifyCaptchaAnswer(parsed.data.id, parsed.data.sequence)) {
      return NextResponse.json(
        { ok: false, error: "Incorrect order — please try again" },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, captchaToken: issueCaptchaToken() });
  } catch (err) {
    console.error("[api/auth/captcha/verify] failed:", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
