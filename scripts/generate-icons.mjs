#!/usr/bin/env node
/**
 * generate-icons.mjs — regenerate brand icon rasters from public/icon.svg.
 *
 * The SVG is the single source of brand truth. This script renders it to PNG
 * at the sizes browsers need and packs them into src/app/favicon.ico so the
 * URL-bar icon always matches the finalized Docloom loom mark. It also emits
 * src/app/apple-icon.png (180x180) for iOS home-screen bookmarks.
 *
 * Run manually: node scripts/generate-icons.mjs
 * (sharp is already in the dependency tree via Next.js; no install needed.)
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const svgPath = path.join(root, "public", "icon.svg");
const svg = readFileSync(svgPath);

const SIZES = [16, 32, 48];
const appleSize = 180;

async function png(size) {
  return sharp(svg, { density: 96 * (size / 64) }).resize(size, size).png().toBuffer();
}

const pngs = [];
for (const size of SIZES) {
  pngs.push({ size, data: await png(size) });
}

// ICO container: header + directory entries + embedded PNGs (valid per spec;
// PNG-in-ICO is supported by all modern browsers).
const headerSize = 6;
const entrySize = 16;
const totalEntrySize = entrySize * pngs.length;
const offsetStart = headerSize + totalEntrySize;

const entries = [];
let offset = offsetStart;
for (const { size, data } of pngs) {
  const entry = Buffer.alloc(entrySize);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width (0 = 256)
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(data.length, 8); // data size
  entry.writeUInt32LE(offset, 12); // data offset
  entries.push(entry);
  offset += data.length;
}

const ico = Buffer.concat([Buffer.alloc(headerSize), ...entries, ...pngs.map((p) => p.data)]);
ico.writeUInt16LE(0, 0); // reserved
ico.writeUInt16LE(1, 2); // type: icon
ico.writeUInt16LE(pngs.length, 4); // image count

const { writeFileSync } = await import("node:fs");
writeFileSync(path.join(root, "src", "app", "favicon.ico"), ico);

// Apple touch icon: solid brand background (iOS does not like transparency).
const apple = await sharp(svg)
  .resize(appleSize, appleSize)
  .flatten({ background: "#09090b" })
  .png()
  .toBuffer();
writeFileSync(path.join(root, "src", "app", "apple-icon.png"), apple);

console.log(
  `Wrote src/app/favicon.ico (${SIZES.join(", ")}) and src/app/apple-icon.png (${appleSize}x${appleSize}) from public/icon.svg`,
);
