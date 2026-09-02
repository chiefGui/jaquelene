import { chatResultFromJSON, type ChatMessages, type ChatResult } from "@openrouter/sdk/models";
import type { DialogueMessage, ModelInput, ProviderGenerationAdapter } from "@jaquelene/backend";
import type { OpenRouterConfiguration } from "./connection";
import { encodeOpenRouterReasoning, type OpenRouterReasoningRequest } from "./reasoning";

type SendOpenRouterChat = (
  apiKey: string,
  request: {
    model: string;
    messages: ChatMessages[];
    metadata: Record<string, string>;
    reasoning?: OpenRouterReasoningRequest;
    session_id: string;
    stream: false;
  },
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
      .flatMap((part) => (part.type === "text" && "text" in part ? [part.text] : []))
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
  return value === null || value === undefined ? undefined : value;
}

function successfulUpstreamProvider(result: ChatResult) {
  const attempts = result.openrouterMetadata?.attempts;
  return (
    attempts?.findLast(({ status }) => status >= 200 && status < 300)?.provider ??
    attempts?.at(-1)?.provider
  );
}

export function createOpenRouterGeneration(
  configuration: Pick<OpenRouterConfiguration, "withApiKey">,
  send: SendOpenRouterChat = sendOpenRouterChat,
): ProviderGenerationAdapter {
  return {
    generate: (request, signal) =>
      configuration.withApiKey(async (apiKey) => {
        const reasoning = encodeOpenRouterReasoning(request.reasoning);
        const result = await send(
          apiKey,
          {
            model: request.modelId,
            messages: toOpenRouterMessages(request.input),
            metadata: { jaquelene_generation_id: request.generationId },
            ...(reasoning ? { reasoning } : {}),
            session_id: request.threadId,
            stream: false,
          },
          signal,
        );
        const { choice, text } = getResponseText(result);
        const upstreamProviderId = successfulUpstreamProvider(result);
        const cacheRead = optionalCount(result.usage?.promptTokensDetails?.cachedTokens);
        const cacheWrite = optionalCount(result.usage?.promptTokensDetails?.cacheWriteTokens);
        const reasoningTokens = optionalCount(
          result.usage?.completionTokensDetails?.reasoningTokens,
        );

        return {
          text,
          providerGenerationId: result.id,
          resolvedModelId: result.model,
          ...(upstreamProviderId ? { upstreamProviderId } : {}),
          ...(choice.finishReason ? { finishReason: choice.finishReason } : {}),
          ...(result.usage
            ? {
                usage: {
                  tokens: {
                    input: {
                      total: result.usage.promptTokens,
                      ...(cacheRead === undefined ? {} : { cacheRead }),
                      ...(cacheWrite === undefined ? {} : { cacheWrite }),
                    },
                    output: {
                      total: result.usage.completionTokens,
                      ...(reasoningTokens === undefined ? {} : { reasoning: reasoningTokens }),
                    },
                    total: result.usage.totalTokens,
                  },
                  ...(result.usage.cost === null || result.usage.cost === undefined
                    ? {}
                    : {
                        cost: {
                          currency: "USD" as const,
                          amountNanos: usdToNanos(result.usage.cost),
                          source: "provider-reported" as const,
                        },
                      }),
                },
              }
            : {}),
        };
      }),
  };
}
