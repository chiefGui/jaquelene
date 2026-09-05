import { Cause, Effect, Exit, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { describe, expect, it, vi } from "vite-plus/test";
import { verifyOpenRouterApiKey } from "./verification";

function httpClient(request: typeof fetch) {
  return Effect.runSync(
    HttpClient.HttpClient.pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, request),
      Effect.provideService(HttpClient.TracerPropagationEnabled, false),
    ),
  );
}

describe("OpenRouter API key verification", () => {
  it("returns OpenRouter's redacted label for an accepted key", async () => {
    const keyLabel = "sk-or-v1-test...123";
    const request = vi.fn<typeof fetch>(async () => Response.json({ data: { label: keyLabel } }));
    await expect(
      Effect.runPromise(verifyOpenRouterApiKey("openrouter-accepted-key", httpClient(request))),
    ).resolves.toEqual({ state: "configured", keyLabel });
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      new URL("https://openrouter.ai/api/v1/key"),
      expect.objectContaining({
        method: "GET",
        headers: { accept: "application/json", authorization: "Bearer openrouter-accepted-key" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([401, 403])(
    "reports rejected authentication for status %s and releases the unread response",
    async (status) => {
      const request = vi.fn<typeof fetch>(async () => new Response("Unauthorized", { status }));
      await expect(
        Effect.runPromise(verifyOpenRouterApiKey("openrouter-rejected-key", httpClient(request))),
      ).resolves.toEqual({ state: "rejected" });
      expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    },
  );

  it.each([
    ["service failure", async () => new Response(null, { status: 503 })],
    [
      "network failure",
      async () => {
        throw new TypeError("fetch failed");
      },
    ],
    [
      "transport timeout",
      async () => {
        throw new DOMException("Timed out", "TimeoutError");
      },
    ],
  ] as const)("reports %s as unavailable without retrying", async (_failure, send) => {
    const request = vi.fn<typeof fetch>(send);
    await expect(
      Effect.runPromise(verifyOpenRouterApiKey("openrouter-test-key", httpClient(request))),
    ).resolves.toEqual({ state: "unavailable" });
    expect(request).toHaveBeenCalledOnce();
  });

  it("preserves unexpected request failures", async () => {
    const failure = new Error("Unexpected failure");
    const request = vi.fn<typeof fetch>(async () => {
      throw failure;
    });
    await expect(
      Effect.runPromise(verifyOpenRouterApiKey("openrouter-test-key", httpClient(request))),
    ).rejects.toBe(failure);
  });

  it.each(["not JSON", "{}", '{"data":{}}', '{"data":{"label":""}}'])(
    "treats malformed success body %s as unavailable",
    async (body) => {
      const request = vi.fn<typeof fetch>(async () => new Response(body));
      await expect(
        Effect.runPromise(verifyOpenRouterApiKey("openrouter-test-key", httpClient(request))),
      ).resolves.toEqual({ state: "unavailable" });
    },
  );

  it("preserves interruption instead of returning unavailable", async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const request = vi.fn<typeof fetch>((_url, options) => {
      started.resolve(options!.signal!);
      return new Promise<Response>(() => {});
    });
    const fiber = Effect.runFork(
      verifyOpenRouterApiKey("openrouter-test-key", httpClient(request)),
    );
    const signal = await started.promise;
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(signal.aborted).toBe(true);
    expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true);
  });

  it("reports a body timeout as unavailable and releases the response", async () => {
    const reading = Promise.withResolvers<void>();
    const response = new Response();
    vi.spyOn(response, "arrayBuffer").mockImplementation(() => {
      reading.resolve();
      return new Promise<ArrayBuffer>(() => {});
    });
    const request = vi.fn<typeof fetch>(async () => response);
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          verifyOpenRouterApiKey("openrouter-test-key", httpClient(request)),
        );
        yield* Effect.promise(() => reading.promise);
        yield* TestClock.adjust(10_000);
        expect(yield* Fiber.join(fiber)).toEqual({ state: "unavailable" });
        expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });
});
