import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { dispatchAlert, webhookSink, type AlertSink } from "./alerts";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function okResponse() {
  return new Response("{}", { status: 200 });
}

describe("dispatchAlert", () => {
  it("delivers to every sink and reports the count", async () => {
    const a: AlertSink = vi.fn(async () => {});
    const b: AlertSink = vi.fn(async () => {});

    const delivered = await dispatchAlert(
      { title: "t", body: "b", severity: "error" },
      [a, b],
    );

    expect(delivered).toBe(2);
    expect(a).toHaveBeenCalledWith(
      expect.objectContaining({ title: "t", body: "b", severity: "error" }),
    );
    expect(b).toHaveBeenCalledOnce();
  });

  it("never throws — a failing sink is swallowed and delivery continues", async () => {
    const bad: AlertSink = vi.fn(async () => {
      throw new Error("sink down");
    });
    const good: AlertSink = vi.fn(async () => {});

    const delivered = await dispatchAlert({ title: "t", body: "b", severity: "warning" }, [bad, good]);

    expect(delivered).toBe(1);
    expect(good).toHaveBeenCalledOnce();
  });

  it("returns 0 for an empty sink list (unconfigured → no-op)", async () => {
    expect(await dispatchAlert({ title: "t", body: "b", severity: "warning" }, [])).toBe(0);
  });

  it("caps the body at 800 chars so a stack-dump alert cannot flood a chat channel", async () => {
    const sink: Mock<AlertSink> = vi.fn(async () => {});
    await dispatchAlert({ title: "t", body: "x".repeat(5000), severity: "error" }, [sink]);
    expect((sink.mock.calls[0] as unknown as [{ body: string }])[0].body.length).toBe(800);
  });
});

describe("webhookSink", () => {
  it("returns null when DOCLOOM_ALERT_WEBHOOK_URL is unset", () => {
    vi.stubEnv("DOCLOOM_ALERT_WEBHOOK_URL", "");
    expect(webhookSink()).toBeNull();
  });

  it("posts a Slack-style { text } payload and delivers on 2xx", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("DOCLOOM_ALERT_WEBHOOK_URL", "https://hooks.example.com/T/B/xxx");

    const sink = webhookSink();
    expect(sink).not.toBeNull();

    const delivered = await dispatchAlert(
      { title: "Generation failed", body: "boom", severity: "error" },
      [sink as AlertSink],
    );

    expect(delivered).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hooks.example.com/T/B/xxx");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as { text: string };
    expect(body.text).toContain("[docloom]");
    expect(body.text).toContain("Generation failed");
    expect(body.text).toContain("boom");
    expect(String(init.signal)).toBeTruthy(); // bounded — never hangs the caller
  });

  it("swallows non-2xx and network failures (delivery is best-effort)", async () => {
    vi.stubEnv("DOCLOOM_ALERT_WEBHOOK_URL", "https://hooks.example.com/T/B/xxx");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));

    const sink = webhookSink() as AlertSink;
    await expect(dispatchAlert({ title: "t", body: "b", severity: "error" }, [sink])).resolves.toBe(0);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(dispatchAlert({ title: "t", body: "b", severity: "error" }, [sink])).resolves.toBe(0);
  });
});
