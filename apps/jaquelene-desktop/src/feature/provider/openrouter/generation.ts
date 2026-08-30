import type { ChatStreamChunk } from "@openrouter/sdk/models";
import {
  EventType,
  chat,
  fromSpecTokenUsage,
  type AdapterYieldChunk,
  type ModelMessage,
  type RunErrorEvent,
  type RunFinishedEvent,
  type StreamChunk,
  type TextOptions,
} from "@tanstack/ai";
import {
  OpenRouterTextAdapter,
  type createOpenRouterText,
  type OpenRouterTextModelOptions,
} from "@tanstack/ai-openrouter";
import type {
  GenerationMessage,
  ProviderGenerationAdapter,
  ProviderGenerationResult,
} from "@jaquelene/backend";
import type { OpenRouterConfiguration } from "./connection";

const openRouterConfiguration = {
  appTitle: "Jaquelene",
  retryConfig: { strategy: "none" as const },
  timeoutMs: 300_000,
};

const generationMetadataKey = "jaquelene";
// Jaquelene loads the user's current OpenRouter catalog at runtime; TanStack's
// generated model union is a compile-time capability hint, not that catalog's authority.
type OpenRouterModelId = Parameters<typeof createOpenRouterText>[0];

type OpenRouterGenerationRequest = Readonly<{
  modelId: string;
  messages: ModelMessage[];
  systemPrompts: string[];
  metadata: Record<string, string>;
  sessionId: string;
  threadId: string;
  runId: string;
}>;

type StartOpenRouterChat = (
  apiKey: string,
  request: OpenRouterGenerationRequest,
  abortController: AbortController,
) => AsyncIterable<StreamChunk>;

/**
 * TanStack's OpenRouter adapter intentionally normalizes away provider response
 * IDs and currently ignores chat-completion refusal deltas. Jaquelene stores
 * the former and treated the latter as assistant output before this adapter,
 * so retain both at the provider boundary without leaking them into the domain.
 */
class JaqueleneOpenRouterTextAdapter extends OpenRouterTextAdapter<OpenRouterModelId> {
  protected override async *processStreamChunks(
    stream: AsyncIterable<ChatStreamChunk>,
    options: TextOptions<OpenRouterTextModelOptions>,
    aguiState: {
      runId: string;
      threadId: string;
      messageId: string;
      hasEmittedRunStarted: boolean;
    },
  ): AsyncIterable<AdapterYieldChunk> {
    let providerGenerationId: string | undefined;
    let refusal = "";
    let emittedAssistantText = false;

    async function* inspectStream() {
      for await (const chunk of stream) {
        if (!providerGenerationId && chunk.id.trim()) {
          providerGenerationId = chunk.id;
        }

        for (const choice of chunk.choices) {
          if (choice.delta.refusal) {
            refusal += choice.delta.refusal;
          }
        }

        yield chunk;
      }
    }

    for await (const event of super.processStreamChunks(inspectStream(), options, aguiState)) {
      if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
        emittedAssistantText = true;
      }

      if (event.type !== EventType.RUN_FINISHED) {
        yield event;
        continue;
      }

      if (!emittedAssistantText && refusal.trim()) {
        const model = event.model ?? options.model;
        const timestamp = Date.now();

        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: aguiState.messageId,
          role: "assistant",
          model,
          timestamp,
        };
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: aguiState.messageId,
          delta: refusal,
          content: refusal,
          model,
          timestamp,
        };
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: aguiState.messageId,
          model,
          timestamp,
        };
      }

      yield {
        ...event,
        ...(providerGenerationId
          ? {
              metadata: {
                ...event.metadata,
                [generationMetadataKey]: { providerGenerationId },
              },
            }
          : {}),
      };
    }
  }
}

function startOpenRouterChat(
  apiKey: string,
  request: OpenRouterGenerationRequest,
  abortController: AbortController,
) {
  const adapter = new JaqueleneOpenRouterTextAdapter(
    { apiKey, ...openRouterConfiguration },
    request.modelId as OpenRouterModelId,
  );

  return chat({
    adapter,
    messages: request.messages,
    systemPrompts: request.systemPrompts,
    modelOptions: {
      metadata: request.metadata,
      sessionId: request.sessionId,
    },
    abortController,
    threadId: request.threadId,
    runId: request.runId,
    debug: false,
  });
}

function splitMessages(messages: readonly GenerationMessage[]) {
  const systemPrompts: string[] = [];
  const modelMessages: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      if (modelMessages.length > 0) {
        throw new TypeError("System generation messages must precede conversation messages.");
      }

      systemPrompts.push(message.content);
    } else {
      modelMessages.push({ role: message.role, content: message.content });
    }
  }

  return { systemPrompts, modelMessages };
}

function linkAbortSignal(signal: AbortSignal) {
  const abortController = new AbortController();
  const abort = () => abortController.abort(signal.reason);

  if (signal.aborted) {
    abort();
  } else {
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
    }
  }

  return {
    abortController,
    dispose: () => signal.removeEventListener("abort", abort),
  };
}

function errorFromRun(event: RunErrorEvent) {
  const error = new Error(event.message || event.error?.message || "OpenRouter generation failed.");
  const code = event.code ?? event.error?.code;

  if (code !== undefined) {
    Object.assign(error, { code });
  }
  if (event.rawEvent !== undefined) {
    Object.assign(error, { rawEvent: event.rawEvent });
  }

  return error;
}

function providerGenerationIdFrom(event: RunFinishedEvent) {
  const metadata = event.metadata?.[generationMetadataKey];

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const providerGenerationId = (metadata as Record<string, unknown>).providerGenerationId;
  return typeof providerGenerationId === "string" && providerGenerationId.trim()
    ? providerGenerationId
    : undefined;
}

function usageFrom(event: RunFinishedEvent) {
  if (!event.usage) {
    return undefined;
  }

  const usage = Array.isArray(event.usage)
    ? fromSpecTokenUsage(event.usage, event.metadata?.tanstack?.usage)
    : event.usage;

  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
  };
}

async function collectGeneration(
  stream: AsyncIterable<StreamChunk>,
  signal: AbortSignal,
): Promise<ProviderGenerationResult> {
  let text = "";
  let finished: RunFinishedEvent | undefined;

  for await (const event of stream) {
    if (event.type === EventType.RUN_ERROR) {
      signal.throwIfAborted();
      throw errorFromRun(event);
    }

    if (finished) {
      throw new TypeError("TanStack AI emitted an event after the generation finished.");
    }

    if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
      text += event.delta;
    } else if (event.type === EventType.RUN_FINISHED) {
      finished = event;
    }
  }

  signal.throwIfAborted();

  if (!finished) {
    throw new TypeError("TanStack AI ended the generation without a completion event.");
  }
  if (!text.trim()) {
    throw new TypeError("OpenRouter returned no assistant text.");
  }

  const providerGenerationId = providerGenerationIdFrom(finished);
  const resolvedModelId = finished.model ?? finished.metadata?.tanstack?.model;
  const finishReason = finished.finishReason ?? finished.metadata?.tanstack?.finishReason;
  const usage = usageFrom(finished);

  return {
    text,
    ...(providerGenerationId ? { providerGenerationId } : {}),
    ...(resolvedModelId ? { resolvedModelId } : {}),
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
  };
}

export function createOpenRouterGeneration(
  configuration: Pick<OpenRouterConfiguration, "withApiKey">,
  startChat: StartOpenRouterChat = startOpenRouterChat,
): ProviderGenerationAdapter {
  return {
    generate: async (request, signal) => {
      signal.throwIfAborted();

      return await configuration.withApiKey(async (apiKey) => {
        signal.throwIfAborted();
        const { systemPrompts, modelMessages } = splitMessages(request.messages);
        const abortLink = linkAbortSignal(signal);

        try {
          const stream = startChat(
            apiKey,
            {
              modelId: request.modelId,
              messages: modelMessages,
              systemPrompts,
              metadata: { jaquelene_generation_id: request.generationId },
              sessionId: request.threadId,
              threadId: request.threadId,
              runId: request.generationId,
            },
            abortLink.abortController,
          );

          return await collectGeneration(stream, signal);
        } finally {
          abortLink.dispose();
        }
      });
    },
  };
}
