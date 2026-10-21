// Uploaded image storage — car photos live on disk under <project>/uploads and
// are served back through GET /api/uploads/[file]. Data-URL payloads are
// decoded and validated server-side (magic-byte sniffing) so only real
// JPEG/PNG/WebP images ever reach the disk.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/** Directory where uploaded images are stored. */
export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** 3 MB decoded ceiling per image (the client downscales before uploading). */
const MAX_BYTES = 3 * 1024 * 1024;

/** Parse a data URL into { mime, bytes } — null when malformed/unsupported/oversized. */
export function parseImageDataUrl(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!EXT_BY_MIME[mime]) return null;
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;
  // Magic-byte sniffing — a renamed text file can never masquerade as an image.
  if (mime === "image/jpeg" && !(bytes[0] === 0xff && bytes[1] === 0xd8)) return null;
  if (mime === "image/png" && !(bytes[0] === 0x89 && bytes[1] === 0x50)) return null;
  if (
    mime === "image/webp" &&
    !(bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP")
  ) {
    return null;
  }
  return { mime, bytes };
}

/** Persist an uploaded image; returns the public URL that serves it. */
export async function saveUploadImage(bytes: Buffer, mime: string): Promise<string> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${EXT_BY_MIME[mime]}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), bytes);
  return `/api/uploads/${name}`;
}

/** True when `file` is a safe stored-image filename (blocks path traversal). */
export function isSafeUploadName(file: string): boolean {
  return /^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(file);
}

/** Content-Type for a stored filename (falls back to octet-stream). */
export function uploadMimeByName(file: string): string {
  return MIME_BY_EXT[file.split(".").pop() ?? ""] ?? "application/octet-stream";
}
