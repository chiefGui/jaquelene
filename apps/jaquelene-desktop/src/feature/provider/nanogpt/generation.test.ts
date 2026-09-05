import { Cause, Effect, Exit, Fiber } from "effect";
import { TestClock } from "effect/testing";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";
import { ids, type ProviderGenerationRequest } from "@jaquelene/backend";
import { describe, expect, it, vi } from "vite-plus/test";
import { createNanoGptGeneration } from "./generation";

function chatResult(overrides: Record<string, unknown> = {}) {
  return {
    id: "nanogpt-generation-1",
    model: "maker/resolved-model",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: "NanoGPT reply" },
      },
    ],
    usage: {
      prompt_tokens: 10,
      prompt_tokens_details: { cached_tokens: 9 },
      cache_creation_input_tokens: 2,
      cache_read_input_tokens: 3,
      completion_tokens: 4,
      completion_tokens_details: { reasoning_tokens: 1 },
      total_tokens: 14,
    },
    x_nanogpt_pricing: {
      cost: 0.000_012_345,
      currency: "USD",
      inputTokens: 10,
      outputTokens: 4,
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

function connection(apiKey = "nanogpt-key") {
  return {
    withApiKey<Result, Error, Requirements>(
      use: (value: string) => Effect.Effect<Result, Error, Requirements>,
    ) {
      return use(apiKey);
    },
  };
}

function transport(body: unknown = chatResult()) {
  const execute = vi.fn((request: HttpClientRequest.HttpClientRequest) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(body))),
  );
  return { execute, client: HttpClient.make(execute) };
}

function requestBody(request: HttpClientRequest.HttpClientRequest) {
  if (request.body._tag !== "Uint8Array") {
    throw new Error("Expected a JSON request body.");
  }
  return JSON.parse(new TextDecoder().decode(request.body.body));
}

describe("NanoGPT generation provider", () => {
  it("sends the credential, semantic input, and accounting request through the HTTP client", async () => {
    const request = generationRequest();
    const { client, execute } = transport();
    const provider = createNanoGptGeneration(connection(), client);

    await expect(Effect.runPromise(provider.generate(request))).resolves.toEqual({
      text: "NanoGPT reply",
      providerGenerationId: "nanogpt-generation-1",
      resolvedModelId: "maker/resolved-model",
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
    const sent = execute.mock.calls[0]![0];
    expect(sent.method).toBe("POST");
    expect(sent.url).toBe("https://nano-gpt.com/api/v1/chat/completions");
    expect(sent.headers).toEqual(
      expect.objectContaining({
        accept: "application/json",
        authorization: "Bearer nanogpt-key",
        "content-type": "application/json",
      }),
    );
    expect(requestBody(sent)).toEqual({
      model: request.modelId,
      messages: [
        { role: "system", content: "Instruction" },
        { role: "user", content: "Earlier message" },
        { role: "assistant", content: "Earlier reply" },
        { role: "user", content: "Hello" },
      ],
      include_usage: true,
      stream: false,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each(["max", "xhigh", "high", "medium", "low", "minimal"] as const)(
    "sends the selected %s reasoning effort",
    async (preset) => {
      const { client, execute } = transport();
      const provider = createNanoGptGeneration(connection(), client);
      await Effect.runPromise(
        provider.generate({
          ...generationRequest(),
          reasoning: { preset, source: "selection" },
        }),
      );
      expect(requestBody(execute.mock.calls[0]![0])).toMatchObject({ reasoning_effort: preset });
    },
  );

  it("disables reasoning explicitly and omits provider defaults", async () => {
    const { client, execute } = transport();
    const provider = createNanoGptGeneration(connection(), client);
    await Effect.runPromise(
      provider.generate({
        ...generationRequest(),
        reasoning: { preset: "off", source: "selection" },
      }),
    );
    expect(requestBody(execute.mock.calls[0]![0])).toMatchObject({ reasoning_effort: "none" });
    await Effect.runPromise(
      provider.generate({
        ...generationRequest(),
        reasoning: { preset: "high", source: "model-default" },
      }),
    );
    expect(requestBody(execute.mock.calls[1]![0])).not.toHaveProperty("reasoning_effort");
  });

  it("selects choice zero, combines text parts, and omits absent metadata", async () => {
    const { client } = transport(
      chatResult({
        id: null,
        model: null,
        choices: [
          { index: 1, message: { content: "Other choice" } },
          {
            index: 0,
            finish_reason: null,
            message: {
              content: [
                { type: "text", text: "First" },
                { type: "image_url", image_url: "ignored" },
                { type: "text", text: " second" },
              ],
            },
          },
        ],
        usage: null,
        x_nanogpt_pricing: null,
      }),
    );
    const provider = createNanoGptGeneration(connection(), client);
    await expect(Effect.runPromise(provider.generate(generationRequest()))).resolves.toEqual({
      text: "First second",
    });
  });

  it("falls back to refusal text", async () => {
    const { client } = transport(
      chatResult({
        choices: [
          {
            index: 0,
            finish_reason: "content_filter",
            message: { content: null, refusal: "Request refused" },
          },
        ],
      }),
    );
    const provider = createNanoGptGeneration(connection(), client);
    await expect(Effect.runPromise(provider.generate(generationRequest()))).resolves.toMatchObject({
      text: "Request refused",
      finishReason: "content_filter",
    });
  });

  it("uses compatible cached and reasoning token counters as fallbacks", async () => {
    const { client } = transport(
      chatResult({
        usage: {
          prompt_tokens: 10,
          prompt_tokens_details: { cached_tokens: 6 },
          completion_tokens: 4,
          reasoning_tokens: 2,
          total_tokens: 14,
        },
        x_nanogpt_pricing: null,
      }),
    );
    const provider = createNanoGptGeneration(connection(), client);
    await expect(Effect.runPromise(provider.generate(generationRequest()))).resolves.toMatchObject({
      usage: {
        tokens: {
          input: { total: 10, cacheRead: 6 },
          output: { total: 4, reasoning: 2 },
          total: 14,
        },
      },
    });
  });

  it.each([
    [{ choices: [] }, "NanoGPT returned no generation choice."],
    [
      { x_nanogpt_pricing: { cost: -1, currency: "USD" } },
      "NanoGPT returned an invalid generation cost.",
    ],
    [{ usage: null }, "NanoGPT returned generation pricing without token usage."],
  ])("rejects malformed completions and accounting", async (overrides, message) => {
    const { client } = transport(chatResult(overrides));
    const provider = createNanoGptGeneration(connection(), client);
    await expect(Effect.runPromise(provider.generate(generationRequest()))).rejects.toThrow(
      message,
    );
  });

  it.each([
    [503, "Service unavailable", "NanoGPT rejected the generation request with status 503."],
    [200, "not-json", "NanoGPT returned an invalid JSON generation response."],
  ])("reports status %s and decoding failures without retry", async (status, body, message) => {
    const execute = vi.fn((request: HttpClientRequest.HttpClientRequest) =>
      Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body, { status }))),
    );
    const provider = createNanoGptGeneration(connection(), HttpClient.make(execute));
    await expect(Effect.runPromise(provider.generate(generationRequest()))).rejects.toThrow(
      message,
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch after credential failure", async () => {
    const failure = new Error("Credential unavailable");
    const { client, execute } = transport();
    const provider = createNanoGptGeneration({ withApiKey: () => Effect.fail(failure) }, client);
    await expect(Effect.runPromise(provider.generate(generationRequest()))).rejects.toBe(failure);
    expect(execute).not.toHaveBeenCalled();
  });

  it("preserves transport error context without retry", async () => {
    const failure = new TypeError("Transport unavailable");
    const fetchRequest = vi.fn<typeof fetch>().mockRejectedValue(failure);
    const client = await Effect.runPromise(
      HttpClient.HttpClient.pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.Fetch, fetchRequest),
      ),
    );
    const provider = createNanoGptGeneration(connection(), client);
    await expect(Effect.runPromise(provider.generate(generationRequest()))).rejects.toMatchObject({
      _tag: "HttpClientError",
      reason: { _tag: "TransportError", cause: failure },
    });
    expect(fetchRequest).toHaveBeenCalledTimes(1);
  });

  it("interrupts an active HTTP request and closes its scope", async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const client = HttpClient.make((_request, _url, signal) => {
      started.resolve(signal);
      return Effect.never;
    });
    const provider = createNanoGptGeneration(connection(), client);
    const fiber = Effect.runFork(provider.generate(generationRequest()));
    const signal = await started.promise;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(signal.aborted).toBe(true);
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true);
  });

  it("times out the complete response body read and aborts its request", async () => {
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
    const provider = createNanoGptGeneration(connection(), client);
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(provider.generate(generationRequest()));
        const signal = yield* Effect.promise(() => started.promise);
        yield* TestClock.adjust(300_000);
        const exit = yield* Fiber.await(fiber);
        expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({
          _tag: "TimeoutError",
        });
        expect(signal.aborted).toBe(true);
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });
});
