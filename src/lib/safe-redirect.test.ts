import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("accepts same-origin paths, including query strings", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/dashboard?connect=steven-tey/dub")).toBe("/dashboard?connect=steven-tey/dub");
    expect(safeNextPath("  /playground?repo=a/b  ")).toBe("/playground?repo=a/b");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.com")).toBeNull();
    expect(safeNextPath("http://evil.com/x")).toBeNull();
    expect(safeNextPath("//evil.com")).toBeNull();
    expect(safeNextPath("/\\evil.com")).toBeNull();
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
  });

  it("rejects encoded protocol-relative and scheme tricks", () => {
    expect(safeNextPath("/%2F%2Fevil.com")).toBeNull();
  });

  it("rejects control characters", () => {
    expect(safeNextPath("/dashboard\nSet-Cookie:x=1")).toBeNull();
    expect(safeNextPath("/dash\u0000board")).toBeNull();
  });

  it("rejects a redirect back into the auth pages (loop guard)", () => {
    expect(safeNextPath("/login")).toBeNull();
    expect(safeNextPath("/login?next=/dashboard")).toBeNull();
    expect(safeNextPath("/api/auth/github")).toBeNull();
  });

  it("rejects empty, missing and over-long values", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(`/${"a".repeat(400)}`)).toBeNull();
  });
});
