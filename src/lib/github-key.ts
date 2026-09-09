import fs from "node:fs";
import path from "node:path";
import { createPrivateKey } from "node:crypto";
import { getEnv } from "./env";
import { loadEnvFileSecrets } from "./env-file";

/**
 * GitHub App private key. Preferred source: GITHUB_PRIVATE_KEY env var (raw
 * PEM, or base64 of one — how it's set on Cloudflare Workers, which have no
 * filesystem). Fallback: GITHUB_PRIVATE_KEY_PATH (a gitignored PEM file) for
 * local dev. NOTE: the path branch must stay second — Next.js inlines direct
 * process.env references at build time, so a GITHUB_PRIVATE_KEY_PATH from
 * .env.local would be baked into the bundle and break on Workers (no fs).
 * GitHub issues PKCS#1 PEMs ("BEGIN RSA PRIVATE KEY"), but jose's importPKCS8
 * needs PKCS#8 — convert transparently here.
 *
 * Node runtime only (fs in the fallback) — imported by lib/github.ts, never
 * by the proxy.
 */
export function githubPrivateKey(): string {
  loadEnvFileSecrets();
  const inline = process.env["GITHUB_PRIVATE_KEY"]?.trim();
  let pem: string;
  if (inline) {
    pem = inline.replace(/\\n/g, "\n");
    if (!pem.startsWith("-----BEGIN")) pem = Buffer.from(pem, "base64").toString("utf8").trim();
  } else {
    const keyPath = getEnv("GITHUB_PRIVATE_KEY_PATH");
    pem = fs.readFileSync(path.resolve(process.cwd(), keyPath), "utf8").trim();
  }
  if (pem.includes("BEGIN RSA PRIVATE KEY")) {
    return createPrivateKey(pem).export({ format: "pem", type: "pkcs8" }).toString();
  }
  return pem;
}
