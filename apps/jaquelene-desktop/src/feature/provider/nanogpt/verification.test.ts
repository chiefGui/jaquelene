import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { verifyNanoGptApiKey } from "./verification";

afterEach(() => vi.restoreAllMocks());

function operationSignal() {
  return new AbortController().signal;
}

describe("NanoGPT API key verification", () => {
  it("accepts a key that can inspect its account balance", async () => {
    const apiKey = "nanogpt-accepted-key";
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json({ usd_balance: "0.50", nano_balance: "1.25" }, { status: 200 }),
      );

    await expect(verifyNanoGptApiKey(apiKey, operationSignal())).resolves.toEqual({
      state: "configured",
    });
    expect(request).toHaveBeenCalledWith("https://nano-gpt.com/api/check-balance", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
      signal: expect.any(AbortSignal),
    });
  });

  it.each([400, 401, 403])("reports status %s as rejected authentication", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }));

    await expect(verifyNanoGptApiKey("nanogpt-rejected-key", operationSignal())).resolves.toEqual({
      state: "rejected",
    });
  });

  it.each([
    ["service failure", async () => new Response(null, { status: 503 })],
    [
      "network failure",
      async () => {
        throw new TypeError("fetch failed");
      },
    ],
  ] as const)("reports %s as unavailable", async (_failure, request) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(request);

    await expect(verifyNanoGptApiKey("nanogpt-test-key", operationSignal())).resolves.toEqual({
      state: "unavailable",
    });
  });

  it("preserves unexpected request failures", async () => {
    const failure = new Error("Unexpected failure");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(failure);

    await expect(verifyNanoGptApiKey("nanogpt-test-key", operationSignal())).rejects.toBe(failure);
  });

  it.each([{ usd_balance: "0.50" }, { usd_balance: "unknown", nano_balance: "1.25" }])(
    "treats malformed success responses as unavailable",
    async (body) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body, { status: 200 }));

      await expect(verifyNanoGptApiKey("nanogpt-test-key", operationSignal())).resolves.toEqual({
        state: "unavailable",
      });
    },
  );
});
