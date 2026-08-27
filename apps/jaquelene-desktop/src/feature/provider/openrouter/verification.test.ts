import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { verifyOpenRouterApiKey } from "./verification";

afterEach(() => vi.restoreAllMocks());

describe("OpenRouter API key verification", () => {
  it("returns OpenRouter's redacted label for an accepted key", async () => {
    const apiKey = "openrouter-accepted-key";
    const keyLabel = "sk-or-v1-test...123";
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ data: { label: keyLabel } }, { status: 200 }));

    await expect(verifyOpenRouterApiKey(apiKey)).resolves.toEqual({
      state: "connected",
      keyLabel,
    });
    expect(request).toHaveBeenCalledWith("https://openrouter.ai/api/v1/key", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: expect.any(AbortSignal),
    });
  });

  it("reports rejected authentication", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    await expect(verifyOpenRouterApiKey("openrouter-rejected-key")).resolves.toEqual({
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

    await expect(verifyOpenRouterApiKey("openrouter-test-key")).resolves.toEqual({
      state: "unavailable",
    });
  });

  it("preserves unexpected request failures", async () => {
    const failure = new Error("Unexpected failure");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(failure);

    await expect(verifyOpenRouterApiKey("openrouter-test-key")).rejects.toBe(failure);
  });

  it("treats malformed success responses as unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: {} }, { status: 200 }));

    await expect(verifyOpenRouterApiKey("openrouter-test-key")).resolves.toEqual({
      state: "unavailable",
    });
  });
});
