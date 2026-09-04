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

type SendOpenRouterChat = (
  apiKey: string,
  request: OpenRouterChatRequest,
  signal: AbortSignal,
) => Promise<ChatResult>;

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

async function sendOpenRouterChat(
  apiKey: string,
  request: Parameters<SendOpenRouterChat>[1],
  signal: AbortSignal,
): Promise<ChatResult> {
  const operationSignal = AbortSignal.any([signal, AbortSignal.timeout(300_000)]);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Metadata": "enabled",
      "X-OpenRouter-Title": "Jaquelene",
    },
    body: JSON.stringify(request),
    signal: operationSignal,
  });

  const body = await response.text();

  if (!response.ok) {
    let cause: unknown = body;

    try {
      cause = JSON.parse(body);
    } catch {
      // Preserve the response body when OpenRouter does not return JSON.
    }

    throw new Error(`OpenRouter rejected the generation request with status ${response.status}.`, {
      cause,
    });
  }

  const result = chatResultFromJSON(body);

  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

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

export function createOpenRouterGeneration(
  configuration: Pick<ApiKeyConfiguration, "withApiKey">,
  send: SendOpenRouterChat = sendOpenRouterChat,
): ProviderGenerationAdapter {
  return {
    generate: (request, signal) =>
      configuration.withApiKey(async (apiKey) => {
        const reasoning = encodeOpenRouterReasoning(request.reasoning);
        const chatRequest: OpenRouterChatRequest = {
          model: request.modelId,
          messages: toOpenRouterMessages(request.input),
          metadata: { jaquelene_operation_id: request.operationId },
          stream: false,
        };

        if (request.conversationId !== undefined) {
          chatRequest.session_id = request.conversationId;
        }

        if (reasoning !== undefined) {
          chatRequest.reasoning = reasoning;
        }

        const result = await send(apiKey, chatRequest, signal);
        const { choice, text } = getResponseText(result);
        const upstreamProviderId = successfulUpstreamProvider(result);
        const cacheRead = optionalCount(result.usage?.promptTokensDetails?.cachedTokens);
        const cacheWrite = optionalCount(result.usage?.promptTokensDetails?.cacheWriteTokens);
        const reasoningTokens = optionalCount(
          result.usage?.completionTokensDetails?.reasoningTokens,
        );
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
      }),
  };
}
