import { Cause, Effect, Exit, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { ids, type ProviderGenerationRequest } from "@jaquelene/backend";
import { describe, expect, it, vi } from "vite-plus/test";
import { createOpenRouterGeneration } from "./generation";

function chatResult(overrides: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: "OpenRouter reply" },
      },
    ],
    created: 1,
    id: "openrouter-generation-1",
    model: "maker/resolved-model",
    object: "chat.completion",
    system_fingerprint: null,
    usage: {
      prompt_tokens: 10,
      prompt_tokens_details: { cached_tokens: 3, cache_write_tokens: 2 },
      completion_tokens: 4,
      completion_tokens_details: { reasoning_tokens: 1 },
      total_tokens: 14,
      cost: 0.000_012_345,
    },
    ...overrides,
  };
}

function generationRequest(): ProviderGenerationRequest {
  return {
    executionId: ids.generation.create(),
    groupId: ids.thread.create(),
    modelId: "maker/requested-model",
    input: {
      instructions: [{ sourceKey: "test.instruction", content: "Instruction" }],
      dialogue: [
        { messageId: ids.message.create(), role: "user", content: "Earlier message" },
        { messageId: ids.message.create(), role: "assistant", content: "Earlier reply" },
        { messageId: ids.message.create(), role: "user", content: "Hello" },
      ],
    },
  };
}

function connection(apiKey = "openrouter-key") {
  return {
    withApiKey<Result, Error, Requirements>(
      use: (value: string) => Effect.Effect<Result, Error, Requirements>,
    ) {
      return use(apiKey);
    },
  };
}

function httpClient(request: typeof fetch) {
  return Effect.runSync(
    HttpClient.HttpClient.pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, request),
      Effect.provideService(HttpClient.TracerPropagationEnabled, false),
    ),
  );
}

function completion(body = chatResult()) {
  const request = vi.fn<typeof fetch>(async () => Response.json(body));
  return { request, provider: createOpenRouterGeneration(connection(), httpClient(request)) };
}

function requestBody(request: ReturnType<typeof completion>["request"]) {
  const body = request.mock.calls[0]?.[1]?.body;
  expect(body).toBeInstanceOf(Uint8Array);
  return JSON.parse(new TextDecoder().decode(body as Uint8Array));
}

describe("OpenRouter generation provider", () => {
  it("sends the exact dialogue, credential, and attribution fields and normalizes accounting", async () => {
    const input = generationRequest();
    const { provider, request } = completion(
      chatResult({
        openrouter_metadata: {
          attempt: 2,
          attempts: [
            { model: "maker/resolved-model", provider: "upstream-failed", status: 503 },
            { model: "maker/resolved-model", provider: "upstream-selected", status: 200 },
          ],
          endpoints: { available: [], total: 0 },
          is_byok: false,
          region: null,
          requested: "maker/requested-model",
          strategy: "fallback",
          summary: "Selected the successful fallback.",
        },
      }),
    );

    await expect(Effect.runPromise(provider.generate(input))).resolves.toEqual({
      text: "OpenRouter reply",
      providerGenerationId: "openrouter-generation-1",
      resolvedModelId: "maker/resolved-model",
      upstreamProviderId: "upstream-selected",
      finishReason: "stop",
      usage: {
        tokens: {
          input: { total: 10, cacheRead: 3, cacheWrite: 2 },
          output: { total: 4, reasoning: 1 },
          total: 14,
        },
        cost: { currency: "USD", amountNanos: 12_345, source: "provider-reported" },
      },
    });
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      new URL("https://openrouter.ai/api/v1/chat/completions"),
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer openrouter-key",
          "content-type": "application/json",
          "x-openrouter-metadata": "enabled",
          "x-openrouter-title": "Jaquelene",
        },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(requestBody(request)).toEqual({
      model: input.modelId,
      messages: [
        { role: "system", content: "Instruction" },
        { role: "user", content: "Earlier message" },
        { role: "assistant", content: "Earlier reply" },
        { role: "user", content: "Hello" },
      ],
      metadata: { jaquelene_execution_id: input.executionId },
      session_id: input.groupId,
      stream: false,
    });
  });

  it("does not invent a group for an independent execution", async () => {
    const { groupId: _, ...input } = generationRequest();
    const { provider, request } = completion();
    await Effect.runPromise(provider.generate(input));
    expect(requestBody(request)).not.toHaveProperty("session_id");
  });

  it.each(["max", "xhigh", "high", "medium", "low", "minimal"] as const)(
    "sends explicit %s reasoning without inventing a token budget",
    async (preset) => {
      const { provider, request } = completion();
      await Effect.runPromise(
        provider.generate({ ...generationRequest(), reasoning: { preset, source: "selection" } }),
      );
      expect(requestBody(request).reasoning).toEqual({ effort: preset });
    },
  );

  it.each([
    ["on", { enabled: true }],
    ["off", { effort: "none" }],
  ] as const)("encodes explicit %s reasoning", async (preset, expected) => {
    const { provider, request } = completion();
    await Effect.runPromise(
      provider.generate({ ...generationRequest(), reasoning: { preset, source: "selection" } }),
    );
    expect(requestBody(request).reasoning).toEqual(expected);
  });

  it.each([
    { preset: "automatic", source: "selection" },
    { preset: "high", source: "model-default" },
  ] as const)("omits provider-managed reasoning %j", async (reasoning) => {
    const { provider, request } = completion();
    await Effect.runPromise(provider.generate({ ...generationRequest(), reasoning }));
    expect(requestBody(request)).not.toHaveProperty("reasoning");
  });

  it("prefers choice index zero and preserves text parts and missing usage", async () => {
    const { provider } = completion(
      chatResult({
        choices: [
          {
            index: 1,
            finish_reason: "stop",
            message: { role: "assistant", content: "Wrong choice" },
          },
          {
            index: 0,
            finish_reason: null,
            message: {
              role: "assistant",
              content: [
                { type: "text", text: "First" },
                { type: "text", text: " second" },
              ],
            },
          },
        ],
        usage: undefined,
      }),
    );
    await expect(Effect.runPromise(provider.generate(generationRequest()))).resolves.toEqual({
      text: "First second",
      providerGenerationId: "openrouter-generation-1",
      resolvedModelId: "maker/resolved-model",
    });
  });

  it("uses refusal text and preserves the raw finish reason", async () => {
    const { provider } = completion(
      chatResult({
        choices: [
          {
            index: 0,
            finish_reason: "content_filter",
            message: { role: "assistant", content: null, refusal: "Request refused" },
          },
        ],
      }),
    );
    await expect(Effect.runPromise(provider.generate(generationRequest()))).resolves.toEqual(
      expect.objectContaining({ text: "Request refused", finishReason: "content_filter" }),
    );
  });

  it.each([
    [[], "OpenRouter returned no generation choice."],
    [
      [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: null } }],
      "OpenRouter returned no assistant text.",
    ],
  ])("rejects unusable completions", async (choices, message) => {
    const { provider } = completion(chatResult({ choices }));
    await expect(Effect.runPromise(provider.generate(generationRequest()))).rejects.toThrow(
      String(message),
    );
  });

  it("preserves credential failures without dispatching HTTP", async () => {
    const failure = new Error("Credential unavailable");
    const request = vi.fn<typeof fetch>();
    const provider = createOpenRouterGeneration(
      { withApiKey: () => Effect.fail(failure) },
      httpClient(request),
    );
    await expect(Effect.runPromise(provider.generate(generationRequest()))).rejects.toBe(failure);
    expect(request).not.toHaveBeenCalled();
  });

  it("preserves transport failure causes without retrying", async () => {
    const cause = new Error("Transport unavailable");
    const request = vi.fn<typeof fetch>(async () => {
      throw cause;
    });
    const provider = createOpenRouterGeneration(connection(), httpClient(request));
    await expect(Effect.runPromise(provider.generate(generationRequest()))).rejects.toMatchObject({
      reason: { _tag: "TransportError", cause },
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    Response.json({ error: "Unavailable" }, { status: 503 }),
    new Response("Unavailable", { status: 503 }),
  ])("reports rejected HTTP requests with the response body", async (response) => {
    const request = vi.fn<typeof fetch>(async () => response);
    const provider = createOpenRouterGeneration(connection(), httpClient(request));
    await expect(Effect.runPromise(provider.generate(generationRequest()))).rejects.toThrow(
      "OpenRouter rejected the generation request with status 503.",
    );
    expect(request).toHaveBeenCalledOnce();
  });

  it("rejects invalid response JSON", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response("not JSON"));
    const provider = createOpenRouterGeneration(connection(), httpClient(request));
    await expect(Effect.runPromise(provider.generate(generationRequest()))).rejects.toThrow();
  });

  it("interrupts an outstanding request and aborts its HTTP signal", async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const request = vi.fn<typeof fetch>((_url, options) => {
      started.resolve(options!.signal!);
      return new Promise<Response>(() => {});
    });
    const provider = createOpenRouterGeneration(connection(), httpClient(request));
    const fiber = Effect.runFork(provider.generate(generationRequest()));
    const signal = await started.promise;
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(signal.aborted).toBe(true);
    expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true);
  });

  it("times out body consumption after headers have arrived", async () => {
    const reading = Promise.withResolvers<void>();
    const response = new Response();
    vi.spyOn(response, "arrayBuffer").mockImplementation(() => {
      reading.resolve();
      return new Promise<ArrayBuffer>(() => {});
    });
    const request = vi.fn<typeof fetch>(async () => response);
    const provider = createOpenRouterGeneration(connection(), httpClient(request));
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(provider.generate(generationRequest()));
        yield* Effect.promise(() => reading.promise);
        yield* TestClock.adjust(300_000);
        const exit = yield* Fiber.await(fiber);
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(Cause.squash(exit.cause)).toMatchObject({ _tag: "TimeoutError" });
        }
        expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });
});
