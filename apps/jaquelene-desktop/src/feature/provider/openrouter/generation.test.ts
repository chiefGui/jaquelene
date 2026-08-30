import {
  EventType,
  type RunFinishedEvent,
  type StreamChunk,
  type TextMessageContentEvent,
} from "@tanstack/ai";
import { ids, type ProviderGenerationRequest } from "@jaquelene/backend";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createOpenRouterGeneration } from "./generation";

function generationRequest(): ProviderGenerationRequest {
  return {
    generationId: ids.generation.create(),
    threadId: ids.thread.create(),
    modelId: "maker/requested-model",
    messages: [
      { role: "system", content: "System instruction" },
      { role: "user", content: "Earlier message" },
      { role: "assistant", content: "Earlier reply" },
      { role: "user", content: "Hello" },
    ],
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

function text(delta: string): TextMessageContentEvent {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: "assistant-message",
    delta,
  };
}

function finished(overrides: Partial<RunFinishedEvent> = {}): RunFinishedEvent {
  return {
    type: EventType.RUN_FINISHED,
    runId: "run-1",
    threadId: "thread-1",
    ...overrides,
  };
}

async function* events(...chunks: StreamChunk[]) {
  yield* chunks;
}

function openRouterStreamResponse(...chunks: object[]) {
  const body = `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;

  return new Response(body, {
    headers: { "Content-Type": "text/event-stream" },
    status: 200,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("OpenRouter generation provider", () => {
  it("uses TanStack AI with the connected credential and normalizes completion metadata", async () => {
    const signal = new AbortController().signal;
    const request = generationRequest();
    let tanStackController: AbortController | undefined;
    const startChat = vi.fn(
      (_apiKey: string, _request: unknown, abortController: AbortController) => {
        tanStackController = abortController;

        return events(
          text("OpenRouter "),
          text("reply"),
          finished({
            model: "maker/resolved-model",
            finishReason: "stop",
            usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
            metadata: {
              jaquelene: { providerGenerationId: "openrouter-generation-1" },
            },
          }),
        );
      },
    );
    const provider = createOpenRouterGeneration(connection(), startChat);

    await expect(provider.generate(request, signal)).resolves.toEqual({
      text: "OpenRouter reply",
      providerGenerationId: "openrouter-generation-1",
      resolvedModelId: "maker/resolved-model",
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
    });
    expect(startChat).toHaveBeenCalledWith(
      "openrouter-key",
      {
        modelId: request.modelId,
        messages: [
          { role: "user", content: "Earlier message" },
          { role: "assistant", content: "Earlier reply" },
          { role: "user", content: "Hello" },
        ],
        systemPrompts: ["System instruction"],
        metadata: { jaquelene_generation_id: request.generationId },
        sessionId: request.threadId,
        threadId: request.threadId,
        runId: request.generationId,
      },
      expect.any(AbortController),
    );
    expect(tanStackController?.signal).not.toBe(signal);
  });

  it("preserves OpenRouter refusal text and response identity through the real TanStack adapter", async () => {
    const request = generationRequest();
    const providerGenerationId = "openrouter-generation-1";
    const fetchRequest = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      openRouterStreamResponse(
        {
          choices: [
            {
              delta: { role: "assistant", refusal: "Request refused" },
              finish_reason: null,
              index: 0,
              logprobs: null,
            },
          ],
          created: 1,
          id: providerGenerationId,
          model: "maker/resolved-model",
          object: "chat.completion.chunk",
        },
        {
          choices: [
            {
              delta: {},
              finish_reason: "content_filter",
              index: 0,
              logprobs: null,
            },
          ],
          created: 1,
          id: providerGenerationId,
          model: "maker/resolved-model",
          object: "chat.completion.chunk",
        },
        {
          choices: [],
          created: 1,
          id: providerGenerationId,
          model: "maker/resolved-model",
          object: "chat.completion.chunk",
          usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
        },
      ),
    );
    const provider = createOpenRouterGeneration(connection());

    await expect(provider.generate(request, operationSignal())).resolves.toEqual({
      text: "Request refused",
      providerGenerationId,
      resolvedModelId: "maker/resolved-model",
      finishReason: "content_filter",
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
    });

    const sentRequest = fetchRequest.mock.calls[0]?.[0];
    expect(sentRequest).toBeInstanceOf(Request);
    if (!(sentRequest instanceof Request)) {
      throw new TypeError("OpenRouter did not issue a Request.");
    }

    expect(sentRequest.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(sentRequest.method).toBe("POST");
    expect(sentRequest.headers.get("Authorization")).toBe("Bearer openrouter-key");
    expect(sentRequest.headers.get("X-OpenRouter-Title")).toBe("Jaquelene");
    await expect(sentRequest.clone().json()).resolves.toEqual(
      expect.objectContaining({
        model: request.modelId,
        messages: [
          { role: "system", content: "System instruction" },
          { role: "user", content: "Earlier message" },
          { role: "assistant", content: "Earlier reply" },
          { role: "user", content: "Hello" },
        ],
        metadata: { jaquelene_generation_id: request.generationId },
        session_id: request.threadId,
        stream: true,
        stream_options: { include_usage: true },
      }),
    );
  });

  it("omits unavailable provider metadata", async () => {
    const provider = createOpenRouterGeneration(connection(), () =>
      events(text("Reply"), finished()),
    );

    await expect(provider.generate(generationRequest(), operationSignal())).resolves.toEqual({
      text: "Reply",
    });
  });

  it("normalizes protocol-native usage totals", async () => {
    const provider = createOpenRouterGeneration(connection(), () =>
      events(
        text("Reply"),
        finished({ usage: [{ inputTokens: 7, outputTokens: 3, totalTokens: 10 }] }),
      ),
    );

    await expect(provider.generate(generationRequest(), operationSignal())).resolves.toEqual({
      text: "Reply",
      usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
    });
  });

  it("rejects invalid stream lifecycles and empty assistant output", async () => {
    const incomplete = createOpenRouterGeneration(connection(), () => events(text("Reply")));
    await expect(incomplete.generate(generationRequest(), operationSignal())).rejects.toThrow(
      "TanStack AI ended the generation without a completion event.",
    );

    const empty = createOpenRouterGeneration(connection(), () => events(finished()));
    await expect(empty.generate(generationRequest(), operationSignal())).rejects.toThrow(
      "OpenRouter returned no assistant text.",
    );

    const trailing = createOpenRouterGeneration(connection(), () =>
      events(text("Reply"), finished(), text("unexpected")),
    );
    await expect(trailing.generate(generationRequest(), operationSignal())).rejects.toThrow(
      "TanStack AI emitted an event after the generation finished.",
    );
  });

  it("turns TanStack run errors into inspectable provider failures", async () => {
    const rawEvent = { error: { message: "Upstream unavailable" } };
    const provider = createOpenRouterGeneration(connection(), () =>
      events({
        type: EventType.RUN_ERROR,
        message: "OpenRouter generation failed",
        code: "503",
        rawEvent,
      }),
    );

    const failure = await provider
      .generate(generationRequest(), operationSignal())
      .catch((cause: unknown) => cause);

    expect(failure).toEqual(
      expect.objectContaining({ message: "OpenRouter generation failed", code: "503", rawEvent }),
    );
  });

  it("preserves credential and local stream failures", async () => {
    const credentialFailure = new Error("Credential unavailable");
    const failedConnection = {
      async withApiKey<Result>(_use: (value: string) => Promise<Result>): Promise<Result> {
        throw credentialFailure;
      },
    };
    const startChat = vi.fn(() => events(text("unused"), finished()));
    const credentialProvider = createOpenRouterGeneration(failedConnection, startChat);

    await expect(credentialProvider.generate(generationRequest(), operationSignal())).rejects.toBe(
      credentialFailure,
    );
    expect(startChat).not.toHaveBeenCalled();

    const streamFailure = new Error("Stream unavailable");
    const failedStream = (): AsyncIterable<StreamChunk> => ({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(streamFailure),
      }),
    });
    const streamProvider = createOpenRouterGeneration(connection(), failedStream);

    await expect(streamProvider.generate(generationRequest(), operationSignal())).rejects.toBe(
      streamFailure,
    );
  });

  it("links cancellation to TanStack and preserves the interruption reason", async () => {
    const operation = new AbortController();
    const interruption = new Error("Generation interrupted by test");
    let tanStackController: AbortController | undefined;
    const provider = createOpenRouterGeneration(connection(), (_apiKey, _request, controller) => {
      tanStackController = controller;

      return (async function* () {
        await new Promise<void>((resolve) =>
          controller.signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        yield { type: EventType.RUN_ERROR, message: "Request aborted" };
      })();
    });
    const result = provider.generate(generationRequest(), operation.signal);

    operation.abort(interruption);

    await expect(result).rejects.toBe(interruption);
    expect(tanStackController?.signal.aborted).toBe(true);
    expect(tanStackController?.signal.reason).toBe(interruption);
  });

  it("rejects an already-cancelled operation before reading the credential", async () => {
    const interruption = new Error("Already interrupted");
    const operation = new AbortController();
    operation.abort(interruption);
    const withApiKey = vi.fn();
    const provider = createOpenRouterGeneration({ withApiKey }, vi.fn());

    await expect(provider.generate(generationRequest(), operation.signal)).rejects.toBe(
      interruption,
    );
    expect(withApiKey).not.toHaveBeenCalled();
  });

  it("rejects system messages that would be reordered by TanStack", async () => {
    const request = generationRequest();
    const startChat = vi.fn(() => events(text("unused"), finished()));
    const provider = createOpenRouterGeneration(connection(), startChat);

    await expect(
      provider.generate(
        {
          ...request,
          messages: [
            { role: "user", content: "Hello" },
            { role: "system", content: "Late instruction" },
          ],
        },
        operationSignal(),
      ),
    ).rejects.toThrow("System generation messages must precede conversation messages.");
    expect(startChat).not.toHaveBeenCalled();
  });
});
