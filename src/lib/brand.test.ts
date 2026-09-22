import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Brand consistency guard: every icon surface the browser can see must come
 * from the finalized Docloom loom mark. The single source of truth is
 * public/icon.svg; src/app/favicon.ico and src/app/apple-icon.png are
 * generated from it by scripts/generate-icons.mjs. This test fails if a
 * scaffold/default icon ever sneaks back in (e.g. a Create Next App
 * favicon.ico) or the metadata wires up the wrong asset.
 */

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

/** The loom mark is drawn with exactly these rect x-coordinates. */
const LOOM_WARP_X = [16, 29, 42];
const LOOM_WARP_WIDTH = 6;

function read(p: string): string {
  return readFileSync(path.join(root, p), "utf8");
}

describe("brand icon consistency", () => {
  it("public/icon.svg is the loom mark on the brand tile", () => {
    const svg = read("public/icon.svg");
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain('fill="#09090b"');
    for (const x of LOOM_WARP_X) {
      expect(svg).toContain(`x="${x}"`);
    }
    expect(svg).toContain('fill="#8b5cf6"');
  });

  it("public/logo-mark.svg is the same loom mark", () => {
    const svg = read("public/logo-mark.svg");
    for (const x of LOOM_WARP_X) {
      expect(svg).toContain(`<rect x="${x}" y="14" width="${LOOM_WARP_WIDTH}" height="36"`);
    }
  });

  it("src/app/favicon.ico exists and is NOT the Create Next App scaffold icon", () => {
    const p = path.join(root, "src", "app", "favicon.ico");
    expect(existsSync(p)).toBe(true);
    const buf = readFileSync(p);
    // ICO header: reserved=0, type=1, count>=3 (16/32/48 generated together).
    expect(buf.readUInt16LE(0)).toBe(0);
    expect(buf.readUInt16LE(2)).toBe(1);
    expect(buf.readUInt16LE(4)).toBeGreaterThanOrEqual(3);
    // The CNA/Vercel scaffold favicon is ~25KB; the generated loom ico is ~1.5KB.
    expect(buf.length).toBeLessThan(10_000);
  });

  it("src/app/apple-icon.png exists and is a 180x180 PNG", () => {
    const p = path.join(root, "src", "app", "apple-icon.png");
    expect(existsSync(p)).toBe(true);
    const buf = readFileSync(p);
    // PNG signature then IHDR width/height at fixed offsets.
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(buf.readUInt32BE(16)).toBe(180);
    expect(buf.readUInt32BE(20)).toBe(180);
  });

  it("layout metadata points every icon surface at the brand assets", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('"/icon.svg"');
    expect(layout).toContain('"/favicon.ico"');
    expect(layout).toContain('"/apple-icon.png"');
  });

  it("manifest points at the brand SVG with the brand background color", () => {
    const manifest = read("src/app/manifest.ts");
    expect(manifest).toContain('"/icon.svg"');
    expect(manifest).toContain('"#09090b"');
  });

  it("the generate-icons script exists so the rasters can be regenerated", () => {
    expect(existsSync(path.join(root, "scripts", "generate-icons.mjs"))).toBe(true);
  });
});
