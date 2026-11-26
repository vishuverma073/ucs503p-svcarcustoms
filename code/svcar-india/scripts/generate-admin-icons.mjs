#!/usr/bin/env node
/**
 * Generates the SV Admin app icons (public/admin-icons/) from the store logo.
 * Run from svcar-india/:  node scripts/generate-admin-icons.mjs
 *
 * - icon-192/512.png     "any" purpose: the round badge logo, transparent corners
 * - maskable-192/512.png full-bleed admin black with the logo inside the 80% safe zone
 * - apple-touch-icon.png 180×180 on admin black (iOS fills transparency with black anyway)
 * - badge-96.png         monochrome white bell for the Android status bar
 *
 * sharp ships with Next.js, so no extra dependency is needed.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "public/uploads/logo/logo-v2.webp");
const OUT = path.join(root, "public/admin-icons");
const ADMIN_BLACK = "#0C0C0D"; // --color-brand-black (admin chrome)

async function logoAt(size) {
  return sharp(SRC).resize(size, size, { fit: "contain", kernel: "lanczos3" }).png().toBuffer();
}

async function onBackground(size, logoRatio, file) {
  const logoSize = Math.round(size * logoRatio);
  const offset = Math.round((size - logoSize) / 2);
  await sharp({ create: { width: size, height: size, channels: 4, background: ADMIN_BLACK } })
    .composite([{ input: await logoAt(logoSize), top: offset, left: offset }])
    .png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
    .toFile(path.join(OUT, file));
}

async function plain(size, file) {
  await sharp(await logoAt(size)).png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 }).toFile(path.join(OUT, file));
}

const BELL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>`;

await mkdir(OUT, { recursive: true });
await plain(192, "icon-192.png");
await plain(512, "icon-512.png");
// The logo is round, so 76% of the edge keeps it inside the maskable safe circle (80%).
await onBackground(192, 0.76, "maskable-192.png");
await onBackground(512, 0.76, "maskable-512.png");
await onBackground(180, 0.88, "apple-touch-icon.png");
await sharp(Buffer.from(BELL_SVG)).png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 }).toFile(path.join(OUT, "badge-96.png"));
console.log(`admin icons written to ${path.relative(root, OUT)}/`);
