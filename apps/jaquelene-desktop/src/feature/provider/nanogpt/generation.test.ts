import { ids, type ProviderGenerationRequest } from "@jaquelene/backend";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createNanoGptGeneration } from "./generation";

afterEach(() => vi.restoreAllMocks());

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
    operationId: ids.generation.create(),
    conversationId: ids.thread.create(),
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

function operationSignal() {
  return new AbortController().signal;
}

function connection(apiKey = "nanogpt-key") {
  return {
    async withApiKey<Result>(use: (value: string) => Promise<Result>) {
      return use(apiKey);
    },
  };
}

describe("NanoGPT generation provider", () => {
  it("sends an authenticated non-streaming chat completion", async () => {
    const request = generationRequest();
    const operation = operationSignal();
    const fetchRequest = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(chatResult(), { status: 200 }));
    const provider = createNanoGptGeneration(connection());

    await expect(provider.generate(request, operation)).resolves.toEqual(
      expect.objectContaining({ text: "NanoGPT reply" }),
    );
    expect(fetchRequest).toHaveBeenCalledWith("https://nano-gpt.com/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer nanogpt-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.modelId,
        messages: [
          { role: "system", content: "Instruction" },
          { role: "user", content: "Earlier message" },
          { role: "assistant", content: "Earlier reply" },
          { role: "user", content: "Hello" },
        ],
        include_usage: true,
        stream: false,
      }),
      signal: expect.any(AbortSignal),
    });
  });

  it("reports generation protocol failures clearly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Service unavailable", { status: 503 }),
    );
    const provider = createNanoGptGeneration(connection());

    await expect(provider.generate(generationRequest(), operationSignal())).rejects.toThrow(
      "NanoGPT rejected the generation request with status 503.",
    );

    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(provider.generate(generationRequest(), operationSignal())).rejects.toThrow(
      "NanoGPT returned an invalid JSON generation response.",
    );
  });

  it("uses the connected credential and normalizes completion accounting", async () => {
    const signal = operationSignal();
    const request = generationRequest();
    const send = vi.fn(async () => chatResult());
    const provider = createNanoGptGeneration(connection(), send);

    await expect(provider.generate(request, signal)).resolves.toEqual({
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
        cost: {
          currency: "USD",
          amountNanos: 12_345,
          source: "provider-reported",
        },
      },
    });
    expect(send).toHaveBeenCalledWith(
      "nanogpt-key",
      {
        model: request.modelId,
        messages: [
          { role: "system", content: "Instruction" },
          { role: "user", content: "Earlier message" },
          { role: "assistant", content: "Earlier reply" },
          { role: "user", content: "Hello" },
        ],
        include_usage: true,
        stream: false,
      },
      signal,
    );
  });

  it.each(["max", "xhigh", "high", "medium", "low", "minimal"] as const)(
    "sends an explicitly selected %s reasoning effort",
    async (preset) => {
      const signal = operationSignal();
      const send = vi.fn(async () => chatResult());
      const provider = createNanoGptGeneration(connection(), send);

      await provider.generate(
        { ...generationRequest(), reasoning: { preset, source: "selection" } },
        signal,
      );

      expect(send).toHaveBeenCalledWith(
        "nanogpt-key",
        expect.objectContaining({ reasoning_effort: preset }),
        signal,
      );
    },
  );

  it("disables reasoning explicitly and omits provider defaults", async () => {
    const signal = operationSignal();
    const send = vi.fn(async () => chatResult());
    const provider = createNanoGptGeneration(connection(), send);

    await provider.generate(
      { ...generationRequest(), reasoning: { preset: "off", source: "selection" } },
      signal,
    );
    expect(send).toHaveBeenLastCalledWith(
      "nanogpt-key",
      expect.objectContaining({ reasoning_effort: "none" }),
      signal,
    );

    await provider.generate(
      { ...generationRequest(), reasoning: { preset: "high", source: "model-default" } },
      signal,
    );
    expect(send).toHaveBeenLastCalledWith(
      "nanogpt-key",
      expect.not.objectContaining({ reasoning_effort: expect.anything() }),
      signal,
    );
  });

  it("combines text content parts and falls back to refusal text", async () => {
    const partsProvider = createNanoGptGeneration(
      connection(),
      vi.fn(async () =>
        chatResult({
          choices: [
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
          x_nanogpt_pricing: undefined,
        }),
      ),
    );

    await expect(partsProvider.generate(generationRequest(), operationSignal())).resolves.toEqual({
      text: "First second",
      providerGenerationId: "nanogpt-generation-1",
      resolvedModelId: "maker/resolved-model",
    });

    const refusalProvider = createNanoGptGeneration(
      connection(),
      vi.fn(async () =>
        chatResult({
          choices: [
            {
              index: 0,
              finish_reason: "content_filter",
              message: { role: "assistant", content: null, refusal: "Request refused" },
            },
          ],
        }),
      ),
    );

    await expect(refusalProvider.generate(generationRequest(), operationSignal())).resolves.toEqual(
      expect.objectContaining({ text: "Request refused", finishReason: "content_filter" }),
    );
  });

  it("uses compatible cached and reasoning token counters as fallbacks", async () => {
    const provider = createNanoGptGeneration(
      connection(),
      vi.fn(async () =>
        chatResult({
          usage: {
            prompt_tokens: 10,
            prompt_tokens_details: { cached_tokens: 6 },
            completion_tokens: 4,
            reasoning_tokens: 2,
            total_tokens: 14,
          },
          x_nanogpt_pricing: undefined,
        }),
      ),
    );

    await expect(provider.generate(generationRequest(), operationSignal())).resolves.toEqual(
      expect.objectContaining({
        usage: {
          tokens: {
            input: { total: 10, cacheRead: 6 },
            output: { total: 4, reasoning: 2 },
            total: 14,
          },
        },
      }),
    );
  });

  it("rejects malformed completions and accounting", async () => {
    const noChoiceProvider = createNanoGptGeneration(
      connection(),
      vi.fn(async () => chatResult({ choices: [] })),
    );
    await expect(noChoiceProvider.generate(generationRequest(), operationSignal())).rejects.toThrow(
      "NanoGPT returned no generation choice.",
    );

    const invalidCostProvider = createNanoGptGeneration(
      connection(),
      vi.fn(async () => chatResult({ x_nanogpt_pricing: { cost: -1, currency: "USD" } })),
    );
    await expect(
      invalidCostProvider.generate(generationRequest(), operationSignal()),
    ).rejects.toThrow("NanoGPT returned an invalid generation cost.");

    const orphanedCostProvider = createNanoGptGeneration(
      connection(),
      vi.fn(async () => chatResult({ usage: undefined })),
    );
    await expect(
      orphanedCostProvider.generate(generationRequest(), operationSignal()),
    ).rejects.toThrow("NanoGPT returned generation pricing without token usage.");
  });

  it("preserves credential and transport failures", async () => {
    const credentialFailure = new Error("Credential unavailable");
    const failedConnection = {
      async withApiKey<Result>(_use: (value: string) => Promise<Result>): Promise<Result> {
        throw credentialFailure;
      },
    };
    const send = vi.fn(async () => chatResult());
    const credentialProvider = createNanoGptGeneration(failedConnection, send);

    await expect(credentialProvider.generate(generationRequest(), operationSignal())).rejects.toBe(
      credentialFailure,
    );
    expect(send).not.toHaveBeenCalled();

    const transportFailure = new Error("Transport unavailable");
    const transportProvider = createNanoGptGeneration(
      connection(),
      vi.fn(async () => {
        throw transportFailure;
      }),
    );

    await expect(transportProvider.generate(generationRequest(), operationSignal())).rejects.toBe(
      transportFailure,
    );
  });
});
