"use client";

// Client-side in-browser Tesseract.js OCR engine for Cambodian banking receipts.
// Runs character recognition inside a Web Worker with live progress tracking (0% -> 100%),
// then parses standard fields (Trx ID, APV, amount, currency, bank, payee, timestamp).

import { createWorker, type Worker } from "tesseract.js";
import { parseReceiptText, type ParsedReceiptData, type VerificationResult } from "./ocr-parser";
import { usdToKhr } from "./currency";

export interface ScanProgress {
  step: "LOADING" | "PREPROCESSING" | "RECOGNIZING" | "PARSING" | "DONE";
  progress: number; // 0 to 100
  message: string;
}

export interface ClientOcrResult {
  success: boolean;
  imageHash: string;
  data: Omit<ParsedReceiptData, "paidAt" | "currency"> & {
    currency: "USD" | "KHR";
    paidAt: string | null;
  };
  verification: VerificationResult;
  rawText: string;
}

let sharedWorkerPromise: Promise<Worker> | null = null;

async function getBrowserWorker(
  onProgress?: (progress: ScanProgress) => void
): Promise<Worker> {
  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (onProgress && m.status === "recognizing text") {
        const pct = Math.round(Number(m.progress || 0) * 100);
        onProgress({
          step: "RECOGNIZING",
          progress: pct,
          message: `Recognizing text (${pct}%)...`,
        });
      }
    },
  });
  return worker;
}

/**
 * Preprocess image in browser using Canvas:
 * Upscale, convert to grayscale, adjust contrast for crisp text detection.
 */
export async function preprocessImageClient(imageSource: string | File): Promise<string> {
  if (typeof window === "undefined") return typeof imageSource === "string" ? imageSource : "";

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const maxDim = 1800;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(typeof imageSource === "string" ? imageSource : "");
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Contrast enhancement & grayscaling
      try {
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        const contrast = 1.25; // 25% contrast boost
        const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));

        for (let i = 0; i < data.length; i += 4) {
          // Luminance formula
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const contrasted = factor * (gray - 128) + 128;
          const clamped = Math.min(255, Math.max(0, contrasted));
          data[i] = clamped;
          data[i + 1] = clamped;
          data[i + 2] = clamped;
        }
        ctx.putImageData(imgData, 0, 0);
      } catch {
        // Continue if pixel manipulation is restricted (e.g. cross-origin)
      }

      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = () => {
      resolve(typeof imageSource === "string" ? imageSource : "");
    };

    if (typeof imageSource === "string") {
      img.src = imageSource;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = String(e.target?.result || "");
      };
      reader.readAsDataURL(imageSource);
    }
  });
}

/**
 * Scan a payment receipt in-browser using Tesseract.js WebAssembly worker.
 * Provides real-time progress callbacks and immediate Cambodian slip field extraction.
 */
export async function scanReceiptInBrowser(
  imageSource: string | File,
  options?: {
    plan?: string;
    cycle?: "MONTHLY" | "YEARLY";
    currency?: "USD" | "KHR";
    manualRef?: string;
  },
  onProgress?: (progress: ScanProgress) => void
): Promise<ClientOcrResult> {
  onProgress?.({
    step: "PREPROCESSING",
    progress: 10,
    message: "Optimizing receipt image resolution & contrast...",
  });

  const processedDataUrl = await preprocessImageClient(imageSource);

  onProgress?.({
    step: "LOADING",
    progress: 25,
    message: "Initializing Tesseract.js neural OCR engine...",
  });

  const worker = await getBrowserWorker(onProgress);

  onProgress?.({
    step: "RECOGNIZING",
    progress: 40,
    message: "Extracting transaction reference, amounts, and dates...",
  });

  let rawText = "";
  try {
    const res = await worker.recognize(processedDataUrl);
    rawText = res.data.text || "";
  } finally {
    await worker.terminate().catch(() => {});
  }

  onProgress?.({
    step: "PARSING",
    progress: 85,
    message: "Analyzing bank slip layout & transaction data...",
  });

  const parsed = parseReceiptText(rawText);

  // Resolve plan price expectation
  const planKey = (options?.plan || "PRO").toUpperCase();
  const isYearly = options?.cycle === "YEARLY";
  let expectedUsd = 49;
  if (planKey === "ENTERPRISE") expectedUsd = isYearly ? 1490 : 149;
  else if (planKey === "PRO") expectedUsd = isYearly ? 490 : 49;
  else if (planKey === "BASIC") expectedUsd = isYearly ? 190 : 19;
  else if (planKey === "FREE") expectedUsd = 0;

  const expectedKhr = usdToKhr(expectedUsd);

  // Client verification flags
  const riskFlags: string[] = [];
  let isUnderpaid = false;
  let amountMatch = true;

  if (parsed.amount != null) {
    if (parsed.currency === "KHR") {
      if (parsed.amount < expectedKhr * 0.95) {
        riskFlags.push("UNDERPAID");
        isUnderpaid = true;
        amountMatch = false;
      }
    } else {
      if (parsed.amount < expectedUsd * 0.95) {
        riskFlags.push("UNDERPAID");
        isUnderpaid = true;
        amountMatch = false;
      }
    }
  }

  const detectedRef = parsed.trxId || parsed.externalRef || parsed.apv;
  let isRefMismatch = false;
  if (options?.manualRef && detectedRef && options.manualRef.trim() !== detectedRef.trim()) {
    isRefMismatch = true;
    riskFlags.push("TRX_ID_MISMATCH");
  }

  const status = riskFlags.length === 0 && detectedRef ? "PASS" : (isUnderpaid ? "MISMATCH" : "WARN");
  let message = "Receipt verified successfully! Trx ID extracted.";
  if (isUnderpaid) {
    message = `Amount detected (${parsed.currency || "USD"} ${parsed.amount?.toLocaleString()}) is less than plan price.`;
  } else if (!detectedRef) {
    message = "Could not automatically identify transaction reference. Please confirm manually.";
  }

  const verification: VerificationResult = {
    status,
    confidence: parsed.confidence,
    amountMatch,
    currencyMatch: parsed.currency === (options?.currency || "USD"),
    isDuplicate: false,
    isOld: false,
    isUnderpaid,
    isWrongMerchant: false,
    isRefMismatch,
    riskFlags,
    message,
    detectedRefOnSlip: detectedRef,
  };

  onProgress?.({
    step: "DONE",
    progress: 100,
    message: "Receipt analysis completed successfully!",
  });

  return {
    success: true,
    imageHash: "client_" + Date.now(),
    data: {
      ...parsed,
      currency: (parsed.currency || options?.currency || "USD") as "USD" | "KHR",
      paidAt: parsed.paidAt ? parsed.paidAt.toISOString() : null,
    },
    verification,
    rawText,
  };
}
