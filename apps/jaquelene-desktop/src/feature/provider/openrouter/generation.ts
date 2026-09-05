import { Effect } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { chatResultFromJSON, type ChatMessages, type ChatResult } from "@openrouter/sdk/models";
import {
  createGenerationUsage,
  createProviderGenerationResult,
  type DialogueMessage,
  type GenerationCost,
  type GenerationUsage,
  type ModelInput,
  type ProviderGenerationAdapter,
} from "@jaquelene/backend";
import type { ApiKeyConfiguration } from "../api-key-configuration";
import { encodeOpenRouterReasoning, type OpenRouterReasoningRequest } from "./reasoning";

type OpenRouterChatRequest = {
  model: string;
  messages: ChatMessages[];
  metadata: Record<string, string>;
  reasoning?: OpenRouterReasoningRequest;
  session_id?: string;
  stream: false;
};

function toOpenRouterDialogue({ role, content }: DialogueMessage): ChatMessages {
  switch (role) {
    case "user":
      return { role, content };
    case "assistant":
      return { role, content };
  }
}

function toOpenRouterMessages({ instructions, dialogue }: ModelInput): ChatMessages[] {
  return [
    ...instructions.map(({ content }) => ({ role: "system" as const, content })),
    ...dialogue.map(toOpenRouterDialogue),
  ];
}

const sendOpenRouterChat = Effect.fn("OpenRouter.sendChat")(
  function* (apiKey: string, request: OpenRouterChatRequest, client: HttpClient.HttpClient) {
    const response = yield* HttpClientRequest.post(
      "https://openrouter.ai/api/v1/chat/completions",
    ).pipe(
      HttpClientRequest.bearerToken(apiKey),
      HttpClientRequest.setHeaders({
        "X-OpenRouter-Metadata": "enabled",
        "X-OpenRouter-Title": "Jaquelene",
      }),
      HttpClientRequest.bodyJsonUnsafe(request),
      HttpClient.withScope(client).execute,
    );

    const body = yield* response.text;

    if (response.status < 200 || response.status >= 300) {
      let cause: unknown = body;

      try {
        cause = JSON.parse(body);
      } catch {
        // Preserve the response body when OpenRouter does not return JSON.
      }

      return yield* Effect.fail(
        new Error(`OpenRouter rejected the generation request with status ${response.status}.`, {
          cause,
        }),
      );
    }

    const result = chatResultFromJSON(body);

    if (!result.ok) {
      return yield* Effect.fail(result.error);
    }

    return result.value;
  },
  Effect.scoped,
  Effect.timeout(300_000),
);

function getResponseText(result: ChatResult) {
  const choice = result.choices.find(({ index }) => index === 0) ?? result.choices[0];

  if (!choice) {
    throw new TypeError("OpenRouter returned no generation choice.");
  }

  const { content, refusal } = choice.message;

  if (typeof content === "string" && content.trim()) {
    return { choice, text: content };
  }

  if (Array.isArray(content)) {
    const text = content
      .flatMap((part) => {
        if (part.type === "text" && "text" in part) {
          return [part.text];
        }

        return [];
      })
      .join("");

    if (text.trim()) {
      return { choice, text };
    }
  }

  if (typeof refusal === "string" && refusal.trim()) {
    return { choice, text: refusal };
  }

  throw new TypeError("OpenRouter returned no assistant text.");
}

const USD_NANOS = 1_000_000_000;

function usdToNanos(amount: number) {
  const nanos = Math.round(amount * USD_NANOS);

  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(nanos)) {
    throw new TypeError("OpenRouter returned an invalid generation cost.");
  }

  return nanos;
}

function optionalCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return undefined;
  }

  return value;
}

function successfulUpstreamProvider(result: ChatResult) {
  const attempts = result.openrouterMetadata?.attempts;
  return (
    attempts?.findLast(({ status }) => status >= 200 && status < 300)?.provider ??
    attempts?.at(-1)?.provider
  );
}

function normalizeResult(result: ChatResult) {
  const { choice, text } = getResponseText(result);
  const upstreamProviderId = successfulUpstreamProvider(result);
  const cacheRead = optionalCount(result.usage?.promptTokensDetails?.cachedTokens);
  const cacheWrite = optionalCount(result.usage?.promptTokensDetails?.cacheWriteTokens);
  const reasoningTokens = optionalCount(result.usage?.completionTokensDetails?.reasoningTokens);
  let finishReason: string | undefined;
  let usage: GenerationUsage | undefined;

  if (choice.finishReason) {
    finishReason = choice.finishReason;
  }

  if (result.usage) {
    let cost: GenerationCost | undefined;

    if (result.usage.cost !== null && result.usage.cost !== undefined) {
      cost = {
        currency: "USD",
        amountNanos: usdToNanos(result.usage.cost),
        source: "provider-reported",
      };
    }

    usage = createGenerationUsage({
      inputTotal: result.usage.promptTokens,
      inputCacheRead: cacheRead,
      inputCacheWrite: cacheWrite,
      outputTotal: result.usage.completionTokens,
      outputReasoning: reasoningTokens,
      total: result.usage.totalTokens,
      cost,
    });
  }

  return createProviderGenerationResult({
    text,
    providerGenerationId: result.id,
    resolvedModelId: result.model,
    upstreamProviderId,
    finishReason,
    usage,
  });
}

export function createOpenRouterGeneration(
  configuration: Pick<ApiKeyConfiguration, "withApiKey">,
  client: HttpClient.HttpClient,
): ProviderGenerationAdapter {
  return {
    generate: Effect.fn("openrouter.generate")((request) =>
      configuration.withApiKey(
        Effect.fnUntraced(function* (apiKey) {
          const reasoning = encodeOpenRouterReasoning(request.reasoning);
          const chatRequest: OpenRouterChatRequest = {
            model: request.modelId,
            messages: toOpenRouterMessages(request.input),
            metadata: { jaquelene_execution_id: request.executionId },
            stream: false,
          };

          if (request.groupId !== undefined) {
            chatRequest.session_id = request.groupId;
          }

          if (reasoning !== undefined) {
            chatRequest.reasoning = reasoning;
          }

          const result = yield* sendOpenRouterChat(apiKey, chatRequest, client);
          return yield* Effect.try({
            try: () => normalizeResult(result),
            catch: (cause) => cause,
          });
        }),
      ),
    ),
  };
}
