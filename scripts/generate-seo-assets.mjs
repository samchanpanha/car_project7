#!/usr/bin/env node
/**
 * Generates the static SEO assets (Open Graph cover + app icons) from
 * public/logo.svg. Run with `node scripts/generate-seo-assets.mjs` after
 * changing the logo. Committed to the repo so runtime never rasterizes SVG.
 */
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const BRAND_BG = "#0f172a";
const AMBER = "#fbbf24";

const logo = await readFile(path.join(PUBLIC, "logo.svg"));

/** Logo on a solid rounded background — used for favicons/manifest icons. */
async function icon(size, padding = 0.18, radius = 0.22) {
  const inner = Math.round(size * (1 - padding * 2));
  const mark = await sharp(logo, { density: 600 })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <rect width="${size}" height="${size}" rx="${Math.round(size * radius)}" fill="${BRAND_BG}"/>
     </svg>`
  );

  return sharp(bg)
    .composite([{ input: mark, top: Math.round(size * padding), left: Math.round(size * padding) }])
    .png()
    .toBuffer();
}

async function cover() {
  const width = 1200;
  const height = 630;
  const card = 132;
  const mark = await sharp(logo, { density: 600 })
    .resize(card - 34, card - 34, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0f172a"/>
        <stop offset="1" stop-color="#1e293b"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.85" cy="0.1" r="0.75">
        <stop offset="0" stop-color="${AMBER}" stop-opacity="0.22"/>
        <stop offset="1" stop-color="${AMBER}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <rect width="${width}" height="${height}" fill="url(#glow)"/>
    <rect x="0" y="0" width="14" height="${height}" fill="${AMBER}"/>
    <text x="80" y="150" font-family="Helvetica, Arial, sans-serif" font-size="26"
          letter-spacing="6" fill="#94a3b8">CAMBODIA CAR MARKETPLACE</text>
    <text x="80" y="330" font-family="Helvetica, Arial, sans-serif" font-size="104"
          font-weight="bold" fill="#ffffff">KhLan</text>
    <text x="80" y="398" font-family="Helvetica, Arial, sans-serif" font-size="42"
          fill="${AMBER}">Buy and sell cars with confidence</text>
    <text x="80" y="470" font-family="Helvetica, Arial, sans-serif" font-size="27"
          fill="#cbd5e1">Verified listings · Evidence-based AI vehicle reports · Khmer &amp; English</text>
    <line x1="80" y1="530" x2="1120" y2="530" stroke="#334155" stroke-width="2"/>
    <text x="80" y="580" font-family="Helvetica, Arial, sans-serif" font-size="24"
          fill="#94a3b8">Phnom Penh · Siem Reap · Sihanoukville</text>
    <text x="1120" y="580" text-anchor="end" font-family="Helvetica, Arial, sans-serif"
          font-size="24" fill="#64748b">khlan-marketplace.onrender.com</text>
  </svg>`;

  return sharp(Buffer.from(svg))
    .composite([{ input: mark, top: 80, left: 1120 - card + 34, }])
    .png()
    .toBuffer();
}

await mkdir(path.join(PUBLIC, "og"), { recursive: true });
await mkdir(path.join(PUBLIC, "icons"), { recursive: true });

await sharp(await cover()).toFile(path.join(PUBLIC, "og", "khlan-cover.png"));
await sharp(await icon(192)).toFile(path.join(PUBLIC, "icons", "icon-192.png"));
await sharp(await icon(512)).toFile(path.join(PUBLIC, "icons", "icon-512.png"));
await sharp(await icon(180, 0.14, 0)).toFile(path.join(PUBLIC, "apple-touch-icon.png"));
await sharp(await icon(64, 0.1, 0.18)).toFile(path.join(PUBLIC, "favicon-64.png"));

console.log("SEO assets written to public/og and public/icons");
