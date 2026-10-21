"use client";

// Client-side image → data URL helper with canvas downscaling.
// Keeps uploads small (Telegram-friendly, JSON-friendly) without any server
// processing: the browser resizes, we send a JPEG/PNG data URL.

/**
 * Read an image File and produce a data URL, downscaled so the longest edge
 * is ≤ maxDim (aspect preserved). Falls back to the raw file reader when the
 * browser cannot decode the image for canvas processing.
 */
export async function fileToDataUrl(
  file: File,
  maxDim = 1280,
  quality = 0.85,
): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  }).catch(() => null);

  if (!raw) throw new Error("Could not read the selected file");

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && raw.length < 400_000) {
      bitmap.close();
      return raw; // small enough already
    }
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return raw;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const out = canvas.toDataURL("image/jpeg", quality);
    return out.length > 0 ? out : raw;
  } catch {
    return raw; // undecodable for canvas — send as-is, server validates size
  }
}
