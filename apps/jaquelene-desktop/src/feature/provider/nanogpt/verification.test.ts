import { Cause, Effect, Exit, Fiber } from "effect";
import { TestClock } from "effect/testing";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";
import { describe, expect, it, vi } from "vite-plus/test";
import { verifyNanoGptApiKey } from "./verification";

function responseClient(response: Response) {
  return HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, response)),
  );
}

describe("NanoGPT API key verification", () => {
  it("accepts a key that can inspect its account balance", async () => {
    const apiKey = "sk-nano-123e4567-e89b-12d3-a456-426614174000";
    const execute = vi.fn((request: HttpClientRequest.HttpClientRequest) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          Response.json({ usd_balance: "0.50", nano_balance: "1.25" }),
        ),
      ),
    );
    await expect(
      Effect.runPromise(verifyNanoGptApiKey(apiKey, HttpClient.make(execute))),
    ).resolves.toEqual({
      state: "configured",
    });
    const request = execute.mock.calls[0]![0];
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://nano-gpt.com/api/check-balance");
    expect(request.headers).toEqual(
      expect.objectContaining({
        accept: "application/json",
        "x-api-key": apiKey,
      }),
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403])(
    "reports status %s as rejected authentication and closes the request",
    async (status) => {
      let requestSignal: AbortSignal | undefined;
      const client = HttpClient.make((request, _url, signal) => {
        requestSignal = signal;
        return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status })));
      });
      await expect(
        Effect.runPromise(verifyNanoGptApiKey("nanogpt-rejected-key", client)),
      ).resolves.toEqual({
        state: "rejected",
      });
      expect(requestSignal?.aborted).toBe(true);
    },
  );

  it("reports a service failure as unavailable without retry", async () => {
    const execute = vi.fn((request: HttpClientRequest.HttpClientRequest) =>
      Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 503 }))),
    );
    await expect(
      Effect.runPromise(verifyNanoGptApiKey("nanogpt-key", HttpClient.make(execute))),
    ).resolves.toEqual({
      state: "unavailable",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("reports network failures as unavailable", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const client = await Effect.runPromise(
      HttpClient.HttpClient.pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.Fetch, request),
      ),
    );
    await expect(Effect.runPromise(verifyNanoGptApiKey("nanogpt-key", client))).resolves.toEqual({
      state: "unavailable",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("preserves unexpected request failures", async () => {
    const failure = new Error("Unexpected failure");
    const request = vi.fn<typeof fetch>().mockRejectedValue(failure);
    const client = await Effect.runPromise(
      HttpClient.HttpClient.pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.Fetch, request),
      ),
    );
    await expect(Effect.runPromise(verifyNanoGptApiKey("nanogpt-key", client))).rejects.toBe(
      failure,
    );
  });

  it.each([
    { usd_balance: "0.50" },
    { usd_balance: "unknown", nano_balance: "1.25" },
    { usd_balance: " ", nano_balance: "1.25" },
    { usd_balance: "Infinity", nano_balance: "1.25" },
    { usd_balance: 0.5, nano_balance: "1.25" },
  ])("treats malformed balance responses as unavailable", async (body) => {
    const client = responseClient(Response.json(body));
    await expect(Effect.runPromise(verifyNanoGptApiKey("nanogpt-key", client))).resolves.toEqual({
      state: "unavailable",
    });
  });

  it("treats malformed JSON as unavailable", async () => {
    const client = responseClient(new Response("not-json"));
    await expect(Effect.runPromise(verifyNanoGptApiKey("nanogpt-key", client))).resolves.toEqual({
      state: "unavailable",
    });
  });

  it("preserves interruption instead of converting it into unavailable", async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const client = HttpClient.make((_request, _url, signal) => {
      started.resolve(signal);
      return Effect.never;
    });
    const fiber = Effect.runFork(verifyNanoGptApiKey("nanogpt-key", client));
    const signal = await started.promise;
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true);
    expect(signal.aborted).toBe(true);
  });

  it("times out the complete balance body read as unavailable", async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const client = HttpClient.make((request, _url, signal) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
        },
      });
      started.resolve(signal);
      return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body)));
    });
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(verifyNanoGptApiKey("nanogpt-key", client));
        const signal = yield* Effect.promise(() => started.promise);
        yield* TestClock.adjust(10_000);
        expect(yield* Fiber.join(fiber)).toEqual({ state: "unavailable" });
        expect(signal.aborted).toBe(true);
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });
});
