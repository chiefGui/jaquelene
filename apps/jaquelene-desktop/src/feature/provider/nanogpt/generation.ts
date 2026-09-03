import type { DialogueMessage, ModelInput, ProviderGenerationAdapter } from "@jaquelene/backend";
import type { NanoGptConfiguration } from "./connection";
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

type SendNanoGptChat = (
  apiKey: string,
  request: NanoGptChatRequest,
  signal: AbortSignal,
) => Promise<unknown>;

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
  return candidate === undefined || candidate === null
    ? undefined
    : requireCount(candidate, description);
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

async function sendNanoGptChat(
  apiKey: string,
  request: NanoGptChatRequest,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch("https://nano-gpt.com/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.any([signal, AbortSignal.timeout(300_000)]),
  });
  const body = await response.text();
  let result: unknown;

  try {
    result = JSON.parse(body);
  } catch (cause) {
    if (response.ok) {
      throw new TypeError("NanoGPT returned an invalid JSON generation response.", { cause });
    }

    result = body;
  }

  if (!response.ok) {
    throw new Error(`NanoGPT rejected the generation request with status ${response.status}.`, {
      cause: result,
    });
  }

  return result;
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
        return part.type === "text" && typeof part.text === "string" ? [part.text] : [];
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
  const promptDetails =
    usage.prompt_tokens_details === undefined || usage.prompt_tokens_details === null
      ? undefined
      : requireObject(usage.prompt_tokens_details, "NanoGPT prompt token details");
  const completionDetails =
    usage.completion_tokens_details === undefined || usage.completion_tokens_details === null
      ? undefined
      : requireObject(usage.completion_tokens_details, "NanoGPT completion token details");
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

  return {
    tokens: {
      input: {
        total: requireCount(usage.prompt_tokens, "input token count"),
        ...(cacheRead === undefined ? {} : { cacheRead }),
        ...(cacheWrite === undefined ? {} : { cacheWrite }),
      },
      output: {
        total: requireCount(usage.completion_tokens, "output token count"),
        ...(reasoning === undefined ? {} : { reasoning }),
      },
      total: requireCount(usage.total_tokens, "total token count"),
    },
    ...(cost ? { cost } : {}),
  };
}

function normalizeResult(candidate: unknown) {
  const result = requireObject(candidate, "The NanoGPT generation response");
  const choice = getResponseChoice(result);
  const text = getResponseText(choice);
  const providerGenerationId = optionalText(result.id, "NanoGPT generation identity");
  const resolvedModelId = optionalText(result.model, "NanoGPT resolved model identity");
  const finishReason = optionalText(choice.finish_reason, "NanoGPT finish reason");
  const usage = normalizeUsage(result);

  return {
    text,
    ...(providerGenerationId ? { providerGenerationId } : {}),
    ...(resolvedModelId ? { resolvedModelId } : {}),
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
  };
}

export function createNanoGptGeneration(
  configuration: Pick<NanoGptConfiguration, "withApiKey">,
  send: SendNanoGptChat = sendNanoGptChat,
): ProviderGenerationAdapter {
  return {
    generate: (request, signal) =>
      configuration.withApiKey(async (apiKey) => {
        const reasoningEffort = encodeNanoGptReasoning(request.reasoning);
        const result = await send(
          apiKey,
          {
            model: request.modelId,
            messages: toNanoGptMessages(request.input),
            include_usage: true,
            ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
            stream: false,
          },
          signal,
        );

        return normalizeResult(result);
      }),
  };
}
