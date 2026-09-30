import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signDiffShareToken, verifyDiffShareToken } from "./share-link";

const GEN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("SHARE_TOKEN_SECRET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("diff share tokens", () => {
  it("round-trips a generation id", () => {
    const token = signDiffShareToken(GEN_ID);
    expect(token).toContain(".");
    expect(verifyDiffShareToken(token)).toBe(GEN_ID);
  });

  it("rejects a tampered signature", () => {
    const token = signDiffShareToken(GEN_ID);
    const [body] = token.split(".");
    expect(verifyDiffShareToken(`${body}.deadbeef`)).toBeNull();
  });

  it("rejects a tampered payload (same signature, different id)", () => {
    const other = "11111111-2222-3333-4444-555555555555";
    const token = signDiffShareToken(GEN_ID);
    const mac = token.slice(token.lastIndexOf(".") + 1);
    const forged = Buffer.from(`diff.${other}`, "utf8").toString("base64url");
    expect(verifyDiffShareToken(`${forged}.${mac}`)).toBeNull();
  });

  it("rejects malformed and empty tokens without throwing", () => {
    expect(verifyDiffShareToken(null)).toBeNull();
    expect(verifyDiffShareToken("")).toBeNull();
    expect(verifyDiffShareToken("not-a-token")).toBeNull();
    expect(verifyDiffShareToken("a.b")).toBeNull();
    expect(verifyDiffShareToken(`${Buffer.from("wrong.namespace", "utf8").toString("base64url")}.x`)).toBeNull();
  });

  it("uses SHARE_TOKEN_SECRET when set, so rotating sessions keeps links valid", () => {
    const token = signDiffShareToken(GEN_ID);
    vi.stubEnv("SHARE_TOKEN_SECRET", "dedicated-share-secret");
    // Signed under the session secret → must not verify under a dedicated one.
    expect(verifyDiffShareToken(token)).toBeNull();
    expect(verifyDiffShareToken(signDiffShareToken(GEN_ID))).toBe(GEN_ID);
  });

  it("verify returns null (not throws) when no signing secret is configured", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("SHARE_TOKEN_SECRET", "");
    expect(() => signDiffShareToken(GEN_ID)).toThrow();
    expect(verifyDiffShareToken("abc.def")).toBeNull();
  });
});
