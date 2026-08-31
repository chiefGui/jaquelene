import type { ChatResult } from "@openrouter/sdk/models";
import { ids, type ProviderGenerationRequest } from "@jaquelene/backend";
import { describe, expect, it, vi } from "vite-plus/test";
import { createOpenRouterGeneration } from "./generation";

function chatResult(overrides: Partial<ChatResult> = {}): ChatResult {
  return {
    choices: [
      {
        index: 0,
        finishReason: "stop",
        message: { role: "assistant", content: "OpenRouter reply" },
      },
    ],
    created: 1,
    id: "openrouter-generation-1",
    model: "maker/resolved-model",
    object: "chat.completion",
    systemFingerprint: null,
    usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
    ...overrides,
  };
}

function generationRequest(): ProviderGenerationRequest {
  return {
    generationId: ids.generation.create(),
    threadId: ids.thread.create(),
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

function connection(apiKey = "openrouter-key") {
  return {
    async withApiKey<Result>(use: (value: string) => Promise<Result>) {
      return use(apiKey);
    },
  };
}

describe("OpenRouter generation provider", () => {
  it("uses the connected credential and normalizes completion metadata", async () => {
    const signal = new AbortController().signal;
    const request = generationRequest();
    const send = vi.fn(async () => chatResult());
    const provider = createOpenRouterGeneration(connection(), send);

    await expect(provider.generate(request, signal)).resolves.toEqual({
      text: "OpenRouter reply",
      providerGenerationId: "openrouter-generation-1",
      resolvedModelId: "maker/resolved-model",
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
    });
    expect(send).toHaveBeenCalledWith(
      "openrouter-key",
      {
        model: request.modelId,
        messages: [
          { role: "system", content: "Instruction" },
          { role: "user", content: "Earlier message" },
          { role: "assistant", content: "Earlier reply" },
          { role: "user", content: "Hello" },
        ],
        metadata: { jaquelene_generation_id: request.generationId },
        sessionId: request.threadId,
        stream: false,
      },
      signal,
    );
  });

  it("combines text content parts and falls back to refusal text", async () => {
    const sendParts = vi.fn(async () =>
      chatResult({
        choices: [
          {
            index: 0,
            finishReason: null,
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
    const partsProvider = createOpenRouterGeneration(connection(), sendParts);

    await expect(partsProvider.generate(generationRequest(), operationSignal())).resolves.toEqual({
      text: "First second",
      providerGenerationId: "openrouter-generation-1",
      resolvedModelId: "maker/resolved-model",
    });

    const sendRefusal = vi.fn(async () =>
      chatResult({
        choices: [
          {
            index: 0,
            finishReason: "content_filter",
            message: { role: "assistant", content: null, refusal: "Request refused" },
          },
        ],
      }),
    );
    const refusalProvider = createOpenRouterGeneration(connection(), sendRefusal);

    await expect(refusalProvider.generate(generationRequest(), operationSignal())).resolves.toEqual(
      expect.objectContaining({ text: "Request refused", finishReason: "content_filter" }),
    );
  });

  it("rejects malformed completions", async () => {
    const noChoiceProvider = createOpenRouterGeneration(
      connection(),
      vi.fn(async () => chatResult({ choices: [] })),
    );
    await expect(noChoiceProvider.generate(generationRequest(), operationSignal())).rejects.toThrow(
      "OpenRouter returned no generation choice.",
    );

    const noTextProvider = createOpenRouterGeneration(
      connection(),
      vi.fn(async () =>
        chatResult({
          choices: [
            {
              index: 0,
              finishReason: "stop",
              message: { role: "assistant", content: null },
            },
          ],
        }),
      ),
    );
    await expect(noTextProvider.generate(generationRequest(), operationSignal())).rejects.toThrow(
      "OpenRouter returned no assistant text.",
    );
  });

  it("preserves credential and transport failures", async () => {
    const credentialFailure = new Error("Credential unavailable");
    const failedConnection = {
      async withApiKey<Result>(_use: (value: string) => Promise<Result>): Promise<Result> {
        throw credentialFailure;
      },
    };
    const send = vi.fn(async () => chatResult());
    const credentialProvider = createOpenRouterGeneration(failedConnection, send);

    await expect(credentialProvider.generate(generationRequest(), operationSignal())).rejects.toBe(
      credentialFailure,
    );
    expect(send).not.toHaveBeenCalled();

    const transportFailure = new Error("Transport unavailable");
    const transportProvider = createOpenRouterGeneration(
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
