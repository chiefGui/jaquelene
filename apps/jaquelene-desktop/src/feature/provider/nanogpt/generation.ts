import { Effect } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import {
  createGenerationUsage,
  createProviderGenerationResult,
  type DialogueMessage,
  type ModelInput,
  type ProviderGenerationAdapter,
} from "@jaquelene/backend";
import type { ApiKeyConfiguration } from "../api-key-configuration";
import { encodeNanoGptReasoning, type NanoGptReasoningEffort } from "./reasoning";

type NanoGptChatMessage = Readonly<{
  role: "system" | "user" | "assistant";
  content: string;
}>;

type NanoGptChatRequest = Readonly<{
  model: string;
  messages: readonly NanoGptChatMessage[];
  include_usage: true;
  reasoning_effort?: NanoGptReasoningEffort;
  stream: false;
}>;

type MutableNanoGptChatRequest = {
  -readonly [Key in keyof NanoGptChatRequest]: NanoGptChatRequest[Key];
};

type JsonObject = Record<string, unknown>;

function requireObject(candidate: unknown, description: string): JsonObject {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new TypeError(`${description} must be an object.`);
  }

  return candidate as JsonObject;
}

function requireText(candidate: unknown, description: string) {
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new TypeError(`${description} must contain text.`);
  }

  return candidate;
}

function optionalText(candidate: unknown, description: string) {
  if (candidate === undefined || candidate === null) {
    return undefined;
  }

  return requireText(candidate, description);
}

function requireCount(candidate: unknown, description: string) {
  if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate < 0) {
    throw new TypeError(`NanoGPT returned an invalid ${description}.`);
  }

  return candidate;
}

function optionalCount(candidate: unknown, description: string) {
  if (candidate === undefined || candidate === null) {
    return undefined;
  }

  return requireCount(candidate, description);
}

function toNanoGptDialogue({ role, content }: DialogueMessage): NanoGptChatMessage {
  switch (role) {
    case "user":
      return { role, content };
    case "assistant":
      return { role, content };
  }
}

function toNanoGptMessages({ instructions, dialogue }: ModelInput): NanoGptChatMessage[] {
  return [
    ...instructions.map(({ content }) => ({ role: "system" as const, content })),
    ...dialogue.map(toNanoGptDialogue),
  ];
}

function getResponseChoice(result: JsonObject) {
  if (!Array.isArray(result.choices)) {
    throw new TypeError("NanoGPT returned an invalid generation choice list.");
  }

  const candidates = result.choices.map((candidate) =>
    requireObject(candidate, "A NanoGPT generation choice"),
  );
  const choice = candidates.find(({ index }) => index === 0) ?? candidates[0];

  if (!choice) {
    throw new TypeError("NanoGPT returned no generation choice.");
  }

  return choice;
}

function getResponseText(choice: JsonObject) {
  const message = requireObject(choice.message, "The NanoGPT assistant message");
  const { content, refusal } = message;

  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .flatMap((candidate) => {
        const part = requireObject(candidate, "A NanoGPT assistant content part");

        if (part.type === "text" && typeof part.text === "string") {
          return [part.text];
        }

        return [];
      })
      .join("");

    if (text.trim()) {
      return text;
    }
  }

  if (typeof refusal === "string" && refusal.trim()) {
    return refusal;
  }

  throw new TypeError("NanoGPT returned no assistant text.");
}

const USD_NANOS = 1_000_000_000;

function usdToNanos(candidate: unknown) {
  if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < 0) {
    throw new TypeError("NanoGPT returned an invalid generation cost.");
  }

  const nanos = Math.round(candidate * USD_NANOS);

  if (!Number.isSafeInteger(nanos)) {
    throw new TypeError("NanoGPT returned an invalid generation cost.");
  }

  return nanos;
}

function normalizeCost(result: JsonObject) {
  if (result.x_nanogpt_pricing === undefined || result.x_nanogpt_pricing === null) {
    return undefined;
  }

  const pricing = requireObject(result.x_nanogpt_pricing, "NanoGPT generation pricing");
  const currency = requireText(pricing.currency, "NanoGPT generation cost currency");

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new TypeError("NanoGPT returned an invalid generation cost currency.");
  }

  return {
    currency,
    amountNanos: usdToNanos(pricing.cost),
    source: "provider-reported" as const,
  };
}

function normalizeUsage(result: JsonObject) {
  if (result.usage === undefined || result.usage === null) {
    if (result.x_nanogpt_pricing !== undefined && result.x_nanogpt_pricing !== null) {
      throw new TypeError("NanoGPT returned generation pricing without token usage.");
    }

    return undefined;
  }

  const usage = requireObject(result.usage, "NanoGPT generation usage");
  let promptDetails: JsonObject | undefined;
  let completionDetails: JsonObject | undefined;

  if (usage.prompt_tokens_details !== undefined && usage.prompt_tokens_details !== null) {
    promptDetails = requireObject(usage.prompt_tokens_details, "NanoGPT prompt token details");
  }

  if (usage.completion_tokens_details !== undefined && usage.completion_tokens_details !== null) {
    completionDetails = requireObject(
      usage.completion_tokens_details,
      "NanoGPT completion token details",
    );
  }

  const cacheRead =
    optionalCount(usage.cache_read_input_tokens, "cache-read input token count") ??
    optionalCount(promptDetails?.cached_tokens, "cached input token count");
  const cacheWrite = optionalCount(
    usage.cache_creation_input_tokens,
    "cache-write input token count",
  );
  const reasoning =
    optionalCount(completionDetails?.reasoning_tokens, "reasoning output token count") ??
    optionalCount(usage.reasoning_tokens, "reasoning output token count");
  const cost = normalizeCost(result);

  return createGenerationUsage({
    inputTotal: requireCount(usage.prompt_tokens, "input token count"),
    inputCacheRead: cacheRead,
    inputCacheWrite: cacheWrite,
    outputTotal: requireCount(usage.completion_tokens, "output token count"),
    outputReasoning: reasoning,
    total: requireCount(usage.total_tokens, "total token count"),
    cost,
  });
}

function normalizeResult(candidate: unknown) {
  const result = requireObject(candidate, "The NanoGPT generation response");
  const choice = getResponseChoice(result);
  const text = getResponseText(choice);
  const providerGenerationId = optionalText(result.id, "NanoGPT generation identity");
  const resolvedModelId = optionalText(result.model, "NanoGPT resolved model identity");
  const finishReason = optionalText(choice.finish_reason, "NanoGPT finish reason");
  const usage = normalizeUsage(result);

  return createProviderGenerationResult({
    text,
    providerGenerationId,
    resolvedModelId,
    upstreamProviderId: undefined,
    finishReason,
    usage,
  });
}

export function createNanoGptGeneration(
  configuration: Pick<ApiKeyConfiguration, "withApiKey">,
  client: HttpClient.HttpClient,
): ProviderGenerationAdapter {
  const scopedClient = HttpClient.withScope(client);
  return {
    generate: Effect.fn("nanogpt.generate")((request) =>
      configuration.withApiKey(
        Effect.fn("nanogpt.request")(
          function* (apiKey: string) {
            const reasoningEffort = encodeNanoGptReasoning(request.reasoning);
            const chatRequest: MutableNanoGptChatRequest = {
              model: request.modelId,
              messages: toNanoGptMessages(request.input),
              include_usage: true,
              stream: false,
            };

            if (reasoningEffort !== undefined) {
              chatRequest.reasoning_effort = reasoningEffort;
            }

            const response = yield* HttpClientRequest.post(
              "https://nano-gpt.com/api/v1/chat/completions",
            ).pipe(
              HttpClientRequest.acceptJson,
              HttpClientRequest.bearerToken(apiKey),
              HttpClientRequest.bodyJsonUnsafe(chatRequest),
              scopedClient.execute,
            );
            if (response.status < 200 || response.status >= 300) {
              return yield* Effect.fail(
                new Error(
                  `NanoGPT rejected the generation request with status ${response.status}.`,
                  {
                    cause: yield* response.text,
                  },
                ),
              );
            }
            const result = yield* response.json.pipe(
              Effect.mapError(
                (cause) =>
                  new TypeError("NanoGPT returned an invalid JSON generation response.", { cause }),
              ),
            );
            return yield* Effect.try({
              try: () => normalizeResult(result),
              catch: (cause) => cause,
            });
          },
          Effect.timeout(300_000),
          Effect.scoped,
        ),
      ),
    ),
  };
}
