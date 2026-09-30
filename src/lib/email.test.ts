import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emailEnabled,
  emailFrom,
  regenerationEmail,
  sendEmail,
  sendRegenerationNotification,
} from "./email";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const NOTICE = {
  to: "dev@example.com",
  repoFullName: "steven-tey/dub",
  branch: "main",
  endpointCount: 12,
  diffUrl: "https://docloom.app/share/diff/tok",
  dashboardUrl: "https://docloom.app/dashboard/repos/abc",
};

describe("sendEmail", () => {
  it("is a no-op returning false when RESEND_API_KEY is unset", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(emailEnabled()).toBe(false);
    await expect(
      sendEmail({ to: "a@b.c", subject: "s", html: "<p>h</p>", text: "t" }),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the Resend REST API with the bearer key and message body", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "Docloom <docs@docloom.app>");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const sent = await sendEmail({ to: "a@b.c", subject: "Hi", html: "<p>h</p>", text: "t" });

    expect(sent).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(String(init.body)) as { from: string; to: string[]; subject: string };
    expect(body.from).toBe("Docloom <docs@docloom.app>");
    expect(body.to).toEqual(["a@b.c"]);
    expect(body.subject).toBe("Hi");
    expect(String(init.signal)).toBeTruthy(); // bounded
  });

  it("throws on a non-2xx provider response", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 422 })));
    await expect(
      sendEmail({ to: "a@b.c", subject: "s", html: "h", text: "t" }),
    ).rejects.toThrow(/HTTP 422/);
  });

  it("falls back to the shared Resend sender when EMAIL_FROM is unset", () => {
    vi.stubEnv("EMAIL_FROM", "");
    expect(emailFrom()).toBe("Docloom <onboarding@resend.dev>");
  });
});

describe("regenerationEmail", () => {
  it("names the repo and links the diff in both the text and HTML parts", () => {
    const message = regenerationEmail(NOTICE);
    expect(message.subject).toContain("steven-tey/dub");
    expect(message.text).toContain(NOTICE.diffUrl);
    expect(message.text).toContain(NOTICE.dashboardUrl);
    expect(message.html).toContain(NOTICE.diffUrl);
    expect(message.to).toBe(NOTICE.to);
    expect(message.subject).toContain("review the diff");
  });

  it("escapes repo/branch values in the HTML part", () => {
    const message = regenerationEmail({ ...NOTICE, repoFullName: "a/<script>", branch: "x&y" });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });
});

describe("sendRegenerationNotification", () => {
  it("delivers through the configured transport", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendRegenerationNotification(NOTICE)).resolves.toBe(true);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { subject: string };
    expect(body.subject).toContain("steven-tey/dub");
  });
});
