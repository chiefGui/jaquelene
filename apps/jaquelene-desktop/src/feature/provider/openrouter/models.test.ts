import { Effect, Exit, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { describe, expect, it, vi } from "vite-plus/test";
import { createOpenRouterModels } from "./models";

function model(overrides: Record<string, unknown> = {}) {
  return {
    id: "meta-llama/text-model",
    name: "Meta: Text model",
    canonical_slug: "meta-llama/text-model",
    created: 1,
    context_length: 128_000,
    architecture: {
      input_modalities: ["text"],
      output_modalities: ["text"],
      modality: "text->text",
    },
    pricing: { prompt: "0.000002", completion: "0.000006", discount: 0.5 },
    links: { details: "https://openrouter.ai/meta-llama/text-model" },
    default_parameters: null,
    per_request_limits: null,
    supported_parameters: [],
    supported_voices: null,
    top_provider: { is_moderated: false },
    ...overrides,
  };
}

function response(models: readonly ReturnType<typeof model>[]) {
  return Response.json({ data: models, links: { next: null }, total_count: models.length });
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

function connection() {
  return {
    withApiKey<Result, Error, Requirements>(
      use: (value: string) => Effect.Effect<Result, Error, Requirements>,
    ) {
      return use("openrouter-model-key");
    },
  };
}

function catalog(models: readonly ReturnType<typeof model>[]) {
  const request = vi.fn<typeof fetch>(async () => response(models));
  return { request, provider: createOpenRouterModels(connection(), httpClient(request)) };
}

describe("OpenRouter model provider", () => {
  it("lists connected text models and normalizes names, pricing, context, and reasoning", async () => {
    const { provider, request } = catalog([
      model({
        reasoning: {
          mandatory: false,
          default_effort: "medium",
          default_enabled: true,
          supported_efforts: ["high", "medium", "low", "none"],
        },
      }),
      model({
        id: "new-lab/research-model",
        name: "New Lab: Research model",
        reasoning: { mandatory: true, default_effort: null, supported_efforts: null },
      }),
      model({
        id: "google/binary-off",
        name: "Google: Binary Off",
        reasoning: { mandatory: false, default_enabled: false },
      }),
      model({
        id: "openai/provider-managed-effort",
        name: "OpenAI: Provider Managed Effort",
        reasoning: {
          mandatory: false,
          default_enabled: true,
          default_effort: "none",
          supported_efforts: ["high", "medium", "low", "none"],
        },
      }),
      model({
        id: "inclusion/budget-backed",
        name: "Inclusion: Budget Backed",
        reasoning: { mandatory: false, default_enabled: true, supports_max_tokens: true },
      }),
      model({ id: "x-ai/grok-model", name: "SpaceXAI: Grok model" }),
      model({
        id: "openrouter/auto-beta",
        name: "OpenRouter: Auto Beta",
        context_length: null,
        pricing: { prompt: "-1", completion: "-1" },
      }),
      model({
        id: "author/image-model",
        name: "Image model",
        architecture: {
          input_modalities: ["text"],
          output_modalities: ["image"],
          modality: "text->image",
        },
      }),
    ]);
    const common = {
      contextWindowTokens: 128_000,
      tokenPricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 3 },
    };

    await expect(Effect.runPromise(provider.list)).resolves.toEqual([
      {
        id: "meta-llama/text-model",
        name: "Text model",
        brandId: "meta",
        ...common,
        reasoning: { defaultPreset: "medium", supportedPresets: ["high", "medium", "low", "off"] },
      },
      {
        id: "new-lab/research-model",
        name: "Research model",
        brandId: "new-lab",
        ...common,
        reasoning: {
          defaultPreset: "automatic",
          supportedPresets: ["automatic", "max", "xhigh", "high", "medium", "low", "minimal"],
        },
      },
      {
        id: "google/binary-off",
        name: "Binary Off",
        brandId: "google",
        ...common,
        reasoning: { defaultPreset: "off", supportedPresets: ["on", "off"] },
      },
      {
        id: "openai/provider-managed-effort",
        name: "Provider Managed Effort",
        brandId: "openai",
        ...common,
        reasoning: {
          defaultPreset: "automatic",
          supportedPresets: ["automatic", "high", "medium", "low", "off"],
        },
      },
      {
        id: "inclusion/budget-backed",
        name: "Budget Backed",
        brandId: "inclusion",
        ...common,
        reasoning: {
          defaultPreset: "medium",
          supportedPresets: ["max", "high", "medium", "low", "minimal", "off"],
        },
      },
      { id: "x-ai/grok-model", name: "Grok model", brandId: "x-ai", ...common },
      { id: "openrouter/auto-beta", name: "Auto Beta", brandId: "openrouter" },
    ]);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      new URL("https://openrouter.ai/api/v1/models/user?offset=0&limit=500"),
      expect.objectContaining({
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: "Bearer openrouter-model-key",
          "x-openrouter-title": "Jaquelene",
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("consumes every page in order using the same credential", async () => {
    const pages = [
      Array.from({ length: 500 }, (_, index) => model({ id: `meta-llama/model-${index}` })),
      [model({ id: "meta-llama/last-model" })],
    ];
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(pages[0]!))
      .mockResolvedValueOnce(response(pages[1]!));
    const configuration = connection();
    const useCredential = vi.spyOn(configuration, "withApiKey");
    const provider = createOpenRouterModels(configuration, httpClient(request));
    const models = await Effect.runPromise(provider.list);
    expect(models).toHaveLength(501);
    expect(models[0]?.id).toBe("meta-llama/model-0");
    expect(models[500]?.id).toBe("meta-llama/last-model");
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      "https://openrouter.ai/api/v1/models/user?offset=0&limit=500",
      "https://openrouter.ai/api/v1/models/user?offset=500&limit=500",
    ]);
    expect(useCredential).toHaveBeenCalledOnce();
  });

  it("preserves catalog transport failures without retrying", async () => {
    const cause = new Error("Catalog unavailable");
    const request = vi.fn<typeof fetch>(async () => {
      throw cause;
    });
    const provider = createOpenRouterModels(connection(), httpClient(request));
    await expect(Effect.runPromise(provider.list)).rejects.toMatchObject({
      reason: { _tag: "TransportError", cause },
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it("rejects HTTP failures without returning a partial catalog", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(Array.from({ length: 500 }, () => model())))
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    const provider = createOpenRouterModels(connection(), httpClient(request));
    await expect(Effect.runPromise(provider.list)).rejects.toThrow(
      "OpenRouter rejected the model request with status 503.",
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid model pricing", async () => {
    const { provider } = catalog([
      model({
        id: "author/invalid-price",
        pricing: { prompt: "not-a-price", completion: "0.000001" },
      }),
    ]);
    await expect(Effect.runPromise(provider.list)).rejects.toThrow(
      'OpenRouter model "author/invalid-price" has invalid pricing.',
    );
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects the invalid context window %s",
    async (contextLength) => {
      const { provider } = catalog([model({ context_length: contextLength })]);
      await expect(Effect.runPromise(provider.list)).rejects.toThrow();
    },
  );

  it.each([
    { mandatory: true, supported_efforts: ["high", "none"] },
    { mandatory: false, default_effort: "high", supported_efforts: ["medium", "low"] },
    { mandatory: false, supported_efforts: [] },
    { mandatory: false, supported_efforts: ["high", "high"] },
    { mandatory: false, supported_efforts: ["high", "future"] },
    { mandatory: true, default_enabled: false },
  ])("rejects inconsistent reasoning metadata %j", async (reasoning) => {
    const { provider } = catalog([model({ reasoning })]);
    await expect(Effect.runPromise(provider.list)).rejects.toThrow();
  });

  it.each(["not JSON", "{}"])("rejects an invalid catalog body %s", async (body) => {
    const request = vi.fn<typeof fetch>(async () => new Response(body));
    const provider = createOpenRouterModels(connection(), httpClient(request));
    await expect(Effect.runPromise(provider.list)).rejects.toThrow();
  });

  it("times out a stalled page body and aborts its request", async () => {
    const reading = Promise.withResolvers<void>();
    const body = new Response();
    vi.spyOn(body, "arrayBuffer").mockImplementation(() => {
      reading.resolve();
      return new Promise<ArrayBuffer>(() => {});
    });
    const request = vi.fn<typeof fetch>(async () => body);
    const provider = createOpenRouterModels(connection(), httpClient(request));
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(provider.list);
        yield* Effect.promise(() => reading.promise);
        yield* TestClock.adjust(10_000);
        const exit = yield* Fiber.await(fiber);
        expect(Exit.isFailure(exit)).toBe(true);
        expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
        expect(request).toHaveBeenCalledOnce();
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });
});
