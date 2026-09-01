import { OpenRouterCore } from "@openrouter/sdk/core.js";
import { chatSend } from "@openrouter/sdk/funcs/chatSend.js";
import type { ChatMessages, ChatResult } from "@openrouter/sdk/models";
import type { DialogueMessage, ModelInput, ProviderGenerationAdapter } from "@jaquelene/backend";
import type { OpenRouterConfiguration } from "./connection";

type SendOpenRouterChat = (
  apiKey: string,
  request: {
    model: string;
    messages: ChatMessages[];
    metadata: Record<string, string>;
    sessionId: string;
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
  const client = new OpenRouterCore({
    apiKey,
    appTitle: "Jaquelene",
    retryConfig: { strategy: "none" },
    timeoutMs: 300_000,
  });
  const response = await chatSend(
    client,
    {
      chatRequest: request,
    },
    { signal },
  );

  if (!response.ok) {
    throw response.error;
  }

  if (!("choices" in response.value)) {
    throw new TypeError("OpenRouter returned a stream for a non-streaming generation.");
  }

  return response.value;
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

export function createOpenRouterGeneration(
  configuration: Pick<OpenRouterConfiguration, "withApiKey">,
  send: SendOpenRouterChat = sendOpenRouterChat,
): ProviderGenerationAdapter {
  return {
    generate: (request, signal) =>
      configuration.withApiKey(async (apiKey) => {
        const result = await send(
          apiKey,
          {
            model: request.modelId,
            messages: toOpenRouterMessages(request.input),
            metadata: { jaquelene_generation_id: request.generationId },
            sessionId: request.threadId,
            stream: false,
          },
          signal,
        );
        const { choice, text } = getResponseText(result);

        return {
          text,
          providerGenerationId: result.id,
          resolvedModelId: result.model,
          ...(choice.finishReason ? { finishReason: choice.finishReason } : {}),
          ...(result.usage
            ? {
                usage: {
                  inputTokens: result.usage.promptTokens,
                  outputTokens: result.usage.completionTokens,
                  totalTokens: result.usage.totalTokens,
                },
              }
            : {}),
        };
      }),
  };
}
