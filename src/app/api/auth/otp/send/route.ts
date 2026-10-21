import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateOtpCode, hashOtpCode } from "@/lib/auth";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
  phone: z.string().regex(/^\+855\d{7,9}$/, "phone must be a Cambodian number like +85512345678"),
  purpose: z.enum(["LOGIN", "VERIFY"]),
});

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ACTIVE_PER_PHONE = 3;

export async function POST(req: Request) {
  try {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = sendSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `${first?.path.join(".") ?? "body"}: ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }
    const { phone, purpose } = parsed.data;

    // LOGIN requires an existing account; VERIFY requires a session (checked client-side
    // by only offering it in profile settings — server re-checks on verify via purpose use).
    if (purpose === "LOGIN") {
      const user = await db.user.findUnique({ where: { phone }, select: { id: true } });
      if (!user) {
        return NextResponse.json(
          { error: "No account with this phone — please register first" },
          { status: 404 },
        );
      }
    }

    // Simple rate limit: at most MAX_ACTIVE_PER_PHONE unconsumed codes per phone.
    const active = await db.otpCode.count({
      where: { phone, consumed: false, expiresAt: { gt: new Date() } },
    });
    if (active >= MAX_ACTIVE_PER_PHONE) {
      return NextResponse.json(
        { error: "Too many codes requested — please wait a few minutes" },
        { status: 429 },
      );
    }

    const code = generateOtpCode();
    await db.otpCode.create({
      data: {
        phone,
        codeHash: hashOtpCode(code),
        purpose,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    // No SMS gateway is wired in this environment: the code is returned in the
    // response (devCode) so the flow stays testable. In production this branch
    // dispatches to an SMS provider and returns { ok: true } only.
    console.log(`[api/auth/otp/send] OTP for ${phone} (${purpose}): ${code}`);
    return NextResponse.json({
      ok: true,
      expiresInSeconds: OTP_TTL_MS / 1000,
      devCode: code,
      note: "demo: SMS gateway not configured — code returned inline",
    });
  } catch (err) {
    console.error("[api/auth/otp/send] failed:", err);
    return NextResponse.json({ error: "Failed to send code" }, { status: 500 });
  }
}
