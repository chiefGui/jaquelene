import { Cause, Effect, Exit, Fiber } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  UrlParams,
} from "effect/unstable/http";
import { describe, expect, it, vi } from "vite-plus/test";
import { createNanoGptModels } from "./models";

function connection(apiKey = "nanogpt-model-key") {
  return {
    withApiKey<Result, Error, Requirements>(
      use: (value: string) => Effect.Effect<Result, Error, Requirements>,
    ) {
      return use(apiKey);
    },
  };
}

function modelClient(data: readonly unknown[]) {
  return HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({ data }))),
  );
}

describe("NanoGPT model provider", () => {
  it("requests the authenticated detailed catalog", async () => {
    const execute = vi.fn((request: HttpClientRequest.HttpClientRequest) =>
      Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({ data: [] }))),
    );
    const models = createNanoGptModels(connection(), HttpClient.make(execute));
    await expect(Effect.runPromise(models.list)).resolves.toEqual([]);
    const request = execute.mock.calls[0]![0];
    expect(request.method).toBe("GET");
    expect(request.url).toBe("https://nano-gpt.com/api/v1/models");
    expect(UrlParams.toString(request.urlParams)).toBe("detailed=true");
    expect(request.headers).toEqual(
      expect.objectContaining({
        accept: "application/json",
        authorization: "Bearer nanogpt-model-key",
      }),
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    [503, "Service unavailable", "NanoGPT rejected the model request with status 503."],
    [200, "not-json", "NanoGPT returned an invalid JSON model catalog."],
    [200, "{}", "NanoGPT returned an invalid JSON model catalog."],
  ])(
    "reports catalog protocol failures at status %s without retry",
    async (status, body, message) => {
      const execute = vi.fn((request: HttpClientRequest.HttpClientRequest) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body, { status }))),
      );
      const models = createNanoGptModels(connection(), HttpClient.make(execute));
      await expect(Effect.runPromise(models.list)).rejects.toThrow(message);
      expect(execute).toHaveBeenCalledTimes(1);
    },
  );

  it("normalizes NanoGPT's detailed text model catalog", async () => {
    const data = [
      {
        id: "meta-llama/reasoning-model",
        owned_by: "meta-llama",
        name: "Meta: Reasoning model",
        context_length: 128_000,
        capabilities: { reasoning: true },
        reasoning_efforts: ["none", "low", "high", "max"],
        pricing: {
          prompt: 1.25,
          completion: 4.5,
          currency: "USD",
          unit: "per_million_tokens",
        },
      },
      {
        id: "standalone-model",
        owned_by: "openai",
        name: "Standalone model",
        context_length: null,
        capabilities: { reasoning: false },
        pricing: {
          prompt: 0.1,
          completion: 0.4,
          currency: "USD",
          unit: "per_million_tokens",
        },
      },
      {
        id: "qwen/omni-model",
        owned_by: "qwen",
        name: "Omni model",
        context_length: 32_000,
        capabilities: { reasoning: true },
        pricing: {
          currency: "USD",
          unit: "per_million_tokens",
          note: "varies_by_modality",
        },
      },
    ];
    const models = createNanoGptModels(connection(), modelClient(data));
    await expect(Effect.runPromise(models.list)).resolves.toEqual([
      {
        id: "meta-llama/reasoning-model",
        name: "Reasoning model",
        brandId: "meta",
        contextWindowTokens: 128_000,
        reasoning: {
          defaultPreset: "automatic",
          supportedPresets: ["automatic", "max", "high", "low", "off"],
        },
        tokenPricing: { inputUsdPerMillion: 1.25, outputUsdPerMillion: 4.5 },
      },
      {
        id: "standalone-model",
        name: "Standalone model",
        brandId: "openai",
        tokenPricing: { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 },
      },
      {
        id: "qwen/omni-model",
        name: "Omni model",
        brandId: "qwen",
        contextWindowTokens: 32_000,
        reasoning: {
          defaultPreset: "automatic",
          supportedPresets: ["automatic"],
        },
      },
    ]);
  });

  it("preserves catalog transport failures", async () => {
    const failure = new TypeError("Catalog unavailable");
    const fetchRequest = vi.fn<typeof fetch>().mockRejectedValue(failure);
    const client = await Effect.runPromise(
      HttpClient.HttpClient.pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.Fetch, fetchRequest),
      ),
    );
    const models = createNanoGptModels(connection(), client);
    await expect(Effect.runPromise(models.list)).rejects.toMatchObject({
      _tag: "HttpClientError",
      reason: { _tag: "TransportError", cause: failure },
    });
    expect(fetchRequest).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ prompt: "1.25", completion: 4.5, currency: "USD", unit: "per_million_tokens" }],
    [{ prompt: 1.25, completion: 4.5, currency: "EUR", unit: "per_million_tokens" }],
    [{ prompt: 1.25, currency: "USD", unit: "per_million_tokens" }],
  ])("rejects invalid model pricing", async (pricing) => {
    const models = createNanoGptModels(
      connection(),
      modelClient([
        {
          id: "maker/invalid-price",
          owned_by: "maker",
          name: "Invalid price",
          context_length: 128_000,
          capabilities: { reasoning: false },
          pricing,
        },
      ]),
    );
    await expect(Effect.runPromise(models.list)).rejects.toThrow(
      'NanoGPT model "maker/invalid-price" has invalid pricing.',
    );
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects the invalid context window %s",
    async (contextLength) => {
      const models = createNanoGptModels(
        connection(),
        modelClient([
          {
            id: "maker/invalid-context",
            owned_by: "maker",
            name: "Invalid context",
            context_length: contextLength,
            capabilities: { reasoning: false },
            pricing: { prompt: 1, completion: 2, currency: "USD", unit: "per_million_tokens" },
          },
        ]),
      );
      await expect(Effect.runPromise(models.list)).rejects.toThrow(
        'NanoGPT model "maker/invalid-context" context window must be a positive safe integer.',
      );
    },
  );

  it("interrupts the catalog HTTP request", async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const client = HttpClient.make((_request, _url, signal) => {
      started.resolve(signal);
      return Effect.never;
    });
    const models = createNanoGptModels(connection(), client);
    const fiber = Effect.runFork(models.list);
    const signal = await started.promise;
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true);
    expect(signal.aborted).toBe(true);
  });
});
