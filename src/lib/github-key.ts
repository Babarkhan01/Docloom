import fs from "node:fs";
import path from "node:path";
import { createPrivateKey } from "node:crypto";
import { getEnv } from "./env";
import { loadEnvFileSecrets } from "./env-file";

/**
 * GitHub App private key. Loaded from GITHUB_PRIVATE_KEY_PATH (a gitignored
 * PEM file — preferred, since PEM bodies don't survive single-line env vars
 * well) or the GITHUB_PRIVATE_KEY env var (raw PEM, or base64 of one).
 * GitHub issues PKCS#1 PEMs ("BEGIN RSA PRIVATE KEY"), but jose's importPKCS8
 * needs PKCS#8 — convert transparently here.
 *
 * Node runtime only (uses fs/crypto) — imported by lib/github.ts, never by
 * the proxy.
 */
export function githubPrivateKey(): string {
  loadEnvFileSecrets();
  const keyPath = process.env.GITHUB_PRIVATE_KEY_PATH;
  let pem: string;
  if (keyPath) {
    pem = fs.readFileSync(path.resolve(process.cwd(), keyPath), "utf8").trim();
  } else {
    const value = getEnv("GITHUB_PRIVATE_KEY").replace(/\\n/g, "\n").trim();
    pem = value.startsWith("-----BEGIN")
      ? value
      : Buffer.from(value, "base64").toString("utf8").trim();
  }
  if (pem.includes("BEGIN RSA PRIVATE KEY")) {
    return createPrivateKey(pem).export({ format: "pem", type: "pkcs8" }).toString();
  }
  return pem;
}
