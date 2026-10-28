import { NextRequest, NextResponse } from "next/server";
import {
  runOcrOnBuffer,
  parseReceiptText,
  computeImageHash,
  verifyReceiptAgainstPlan,
} from "@/lib/payments/ocr";
import { usdToKhr } from "@/lib/payments/currency";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Next.js Server-Side OCR API Route Handler.
 * Processes uploaded Cambodian bank payment slips using Sharp image preprocessing
 * and Tesseract.js neural OCR, returning validated transaction fields and anti-fraud checks.
 */
export async function POST(req: NextRequest) {
  try {
    let imageBuffer: Buffer | null = null;
    let plan = "PRO";
    let cycle: "MONTHLY" | "YEARLY" = "MONTHLY";
    let currency: "USD" | "KHR" = "USD";
    let manualRef: string | undefined;
    let skipMerchant = true;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      const rawImage = body.image || body.imageDataUrl || body.file;
      plan = (body.plan || "PRO").toUpperCase();
      cycle = body.cycle === "YEARLY" || body.billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY";
      currency = body.currency === "KHR" ? "KHR" : "USD";
      manualRef = body.manualRef ? String(body.manualRef).trim() : undefined;
      skipMerchant = body.skipMerchant !== false;

      if (typeof rawImage === "string") {
        if (rawImage.startsWith("data:")) {
          const base64Data = rawImage.replace(/^data:[^;]+;base64,/, "");
          imageBuffer = Buffer.from(base64Data, "base64");
        } else if (rawImage.startsWith("<svg") || rawImage.includes("<svg")) {
          imageBuffer = Buffer.from(rawImage, "utf-8");
        }
      }
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") || formData.get("image");
      if (file && typeof file === "object" && "arrayBuffer" in file) {
        const bytes = await (file as Blob).arrayBuffer();
        imageBuffer = Buffer.from(bytes);
      }
      const formPlan = formData.get("plan");
      if (formPlan) plan = String(formPlan).toUpperCase();
      const formCycle = formData.get("cycle") || formData.get("billingCycle");
      if (formCycle) cycle = String(formCycle) === "YEARLY" ? "YEARLY" : "MONTHLY";
      const formCurrency = formData.get("currency");
      if (formCurrency) currency = String(formCurrency) === "KHR" ? "KHR" : "USD";
      const formRef = formData.get("manualRef");
      if (formRef) manualRef = String(formRef).trim();
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid image buffer or data URL provided" },
        { status: 400 }
      );
    }

    // 1. Compute SHA-256 image hash
    const imageHash = computeImageHash(imageBuffer);

    // 2. Perform OCR character recognition
    let rawText = "";

    // If SVG, extract textual content directly for 100% precision, otherwise run Tesseract OCR
    const isSvg = imageBuffer.slice(0, 50).toString("utf-8").toLowerCase().includes("<svg");
    if (isSvg) {
      const svgStr = imageBuffer.toString("utf-8");
      // Strip SVG markup to get raw text
      rawText = svgStr
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
    } else {
      rawText = await runOcrOnBuffer(imageBuffer);
    }

    // 3. Parse Cambodian receipt fields
    const parsed = parseReceiptText(rawText);

    // 4. Resolve plan pricing expectations
    const isYearly = cycle === "YEARLY";
    let expectedUsd = 49;
    if (plan === "ENTERPRISE") expectedUsd = isYearly ? 1490 : 149;
    else if (plan === "PRO") expectedUsd = isYearly ? 490 : 49;
    else if (plan === "BASIC") expectedUsd = isYearly ? 190 : 19;
    else if (plan === "FREE") expectedUsd = 0;

    const expectedKhr = usdToKhr(expectedUsd);

    // 5. Anti-fraud verification
    let verification;
    try {
      verification = await verifyReceiptAgainstPlan({
        parsed,
        expectedUsd,
        expectedKhr,
        expectedCurrency: currency,
        imageHash,
        enteredRef: manualRef,
        skipMerchantCheck: skipMerchant,
      });
    } catch (verifyErr) {
      console.error("[Next.js OCR Route Handler] verifyReceiptAgainstPlan failed:", verifyErr);
      // Fallback verification if local database lookup fails
      const riskFlags: string[] = [];
      let isUnderpaid = false;
      let isDuplicate = false;
      let duplicateDetails: string | null = null;

      // Attempt to query backend check-ref API for duplicate check
      const fallbackTarget = parsed.trxId || parsed.apv || manualRef;
      if (fallbackTarget) {
        try {
          const backendBase = process.env.BACKEND_URL || "http://backend:8080";
          const res = await fetch(`${backendBase}/api/tenant/payments/check-ref?ref=${encodeURIComponent(fallbackTarget.trim())}`, {
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) {
            const json = (await res.json()) as { duplicate?: boolean; message?: string };
            if (json.duplicate) {
              isDuplicate = true;
              duplicateDetails = json.message || "This transaction reference has already been verified or submitted.";
              riskFlags.push("DUPLICATE_TRANSACTION_ID");
            }
          }
        } catch (beErr) {
          console.warn("[Next.js OCR Route Handler] Fallback check-ref query failed:", beErr);
        }
      }

      if (parsed.amount != null) {
        const threshold = (currency === "KHR" ? expectedKhr : expectedUsd) * 0.95;
        if (parsed.amount < threshold) {
          riskFlags.push("UNDERPAID");
          isUnderpaid = true;
        }
      }
      verification = {
        status: (isDuplicate || isUnderpaid ? "MISMATCH" : riskFlags.length === 0 ? "PASS" : "WARN") as "PASS" | "WARN" | "MISMATCH",
        confidence: parsed.confidence,
        amountMatch: !isUnderpaid,
        currencyMatch: parsed.currency === currency,
        isDuplicate,
        isOld: false,
        isUnderpaid,
        isWrongMerchant: false,
        riskFlags,
        message: isDuplicate
          ? (duplicateDetails || "Duplicate transaction reference detected.")
          : isUnderpaid
          ? `Amount detected is less than plan price.`
          : "Receipt verified successfully! Trx ID extracted.",
      };
    }

    return NextResponse.json({
      success: true,
      blocked: Boolean(verification.isWrongMerchant),
      imageHash,
      data: {
        trxId: parsed.trxId,
        externalRef: parsed.externalRef,
        apv: parsed.apv,
        amount: parsed.amount,
        currency: parsed.currency || currency,
        amountUsd: parsed.amountUsd,
        amountKhr: parsed.amountKhr,
        paidAt: parsed.paidAt ? parsed.paidAt.toISOString() : null,
        paidAtRaw: parsed.paidAtRaw,
        payerName: parsed.payerName,
        payerAccount: parsed.payerAccount,
        payee: parsed.payee,
        beneficiaryBank: parsed.beneficiaryBank,
        bankName: parsed.bankName || "Bakong KHQR",
        bankCode: parsed.bankCode || "BAKONG",
        isInterbank: Boolean(parsed.isInterbank),
        confidence: parsed.confidence,
        rawText: parsed.rawText,
      },
      verification,
    });
  } catch (err) {
    console.error("[Next.js OCR Route Handler] Unhandled error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to process receipt OCR",
      },
      { status: 500 }
    );
  }
}

