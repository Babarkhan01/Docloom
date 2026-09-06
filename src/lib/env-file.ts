import fs from "node:fs";
import path from "node:path";

let loaded = false;

/**
 * Load additional KEY=value pairs from `.env.local.secrets` (gitignored) into
 * process.env. Complements Next.js' built-in .env loading and dotenv-cli:
 * only fills variables that are missing or empty — anything already set in
 * the real environment always wins. Runs once per process; silently no-ops
 * when the file doesn't exist. Node runtime only (uses fs) — do not import
 * from the proxy or any edge-runtime module.
 */
export function loadEnvFileSecrets(): void {
  if (loaded) return;
  loaded = true;

  let contents: string;
  try {
    contents = fs.readFileSync(path.resolve(process.cwd(), ".env.local.secrets"), "utf8");
  } catch {
    return; // optional file
  }

  for (const line of contents.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^"(.*)"$/, "$1").trim();
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}
