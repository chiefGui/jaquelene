import {
  createGenerationUsage,
  type GenerationCost,
  type GenerationUsage,
  type ProviderGenerationResult,
} from "#backend/provider/provider";

export type ProviderAccounting = Readonly<{
  providerGenerationId: string | null;
  resolvedModelId: string | null;
  upstreamProviderId: string | null;
  finishReason: string | null;
  usage: GenerationUsage | null;
}>;

function requireOptionalText(value: string | undefined, field: string) {
  if (value === undefined) {
    return null;
  }

  if (!value.trim()) {
    throw new TypeError(`A generation provider returned an empty ${field}.`);
  }

  return value;
}

function requireTokenCount(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`A generation provider returned an invalid ${field}.`);
  }

  return value;
}

function requireOptionalTokenCount(value: number | undefined, field: string) {
  if (value === undefined) {
    return undefined;
  }

  return requireTokenCount(value, field);
}

function normalizeProviderMetadata(
  result: ProviderGenerationResult,
): Omit<ProviderAccounting, "usage"> {
  return {
    providerGenerationId: requireOptionalText(result.providerGenerationId, "generation identity"),
    resolvedModelId: requireOptionalText(result.resolvedModelId, "resolved model identity"),
    upstreamProviderId: requireOptionalText(
      result.upstreamProviderId,
      "upstream provider identity",
    ),
    finishReason: requireOptionalText(result.finishReason, "finish reason"),
  };
}

function normalizeProviderUsage(result: ProviderGenerationResult): GenerationUsage | null {
  if (!result.usage) {
    return null;
  }

  let cost: GenerationCost | undefined;

  if (result.usage.cost) {
    cost = {
      currency: result.usage.cost.currency,
      amountNanos: requireTokenCount(result.usage.cost.amountNanos, "cost amount in nanos"),
      source: result.usage.cost.source,
    };
  }

  const usage = createGenerationUsage({
    inputTotal: requireTokenCount(result.usage.tokens.input.total, "input token count"),
    inputCacheRead: requireOptionalTokenCount(
      result.usage.tokens.input.cacheRead,
      "cache-read input token count",
    ),
    inputCacheWrite: requireOptionalTokenCount(
      result.usage.tokens.input.cacheWrite,
      "cache-write input token count",
    ),
    outputTotal: requireTokenCount(result.usage.tokens.output.total, "output token count"),
    outputReasoning: requireOptionalTokenCount(
      result.usage.tokens.output.reasoning,
      "reasoning output token count",
    ),
    total: requireTokenCount(result.usage.tokens.total, "total token count"),
    cost,
  });
  const { input, output } = usage.tokens;

  if (input.cacheRead !== undefined && input.cacheRead > input.total) {
    throw new TypeError("A generation provider returned cache-read tokens above input tokens.");
  }

  if (input.cacheWrite !== undefined && input.cacheWrite > input.total) {
    throw new TypeError("A generation provider returned cache-write tokens above input tokens.");
  }

  if (output.reasoning !== undefined && output.reasoning > output.total) {
    throw new TypeError("A generation provider returned reasoning tokens above output tokens.");
  }

  if (usage.tokens.total < input.total || usage.tokens.total < output.total) {
    throw new TypeError("A generation provider returned an invalid total token count.");
  }

  if (
    usage.cost &&
    (!/^[A-Z]{3}$/.test(usage.cost.currency) ||
      (usage.cost.source !== "provider-reported" && usage.cost.source !== "estimated"))
  ) {
    throw new TypeError("A generation provider returned unsupported cost metadata.");
  }

  return usage;
}

export function normalizeProviderAccounting(result: ProviderGenerationResult) {
  const causes: unknown[] = [];
  let metadata: Omit<ProviderAccounting, "usage"> = {
    providerGenerationId: null,
    resolvedModelId: null,
    upstreamProviderId: null,
    finishReason: null,
  };
  let usage: GenerationUsage | null = null;

  try {
    metadata = normalizeProviderMetadata(result);
  } catch (cause) {
    causes.push(cause);
  }

  try {
    usage = normalizeProviderUsage(result);
  } catch (cause) {
    causes.push(cause);
  }

  const accounting = { ...metadata, usage } satisfies ProviderAccounting;

  if (causes.length === 0) {
    return { outcome: "valid" as const, accounting };
  }

  let cause: unknown = causes[0];

  if (causes.length > 1) {
    cause = new AggregateError(causes, "A generation provider returned invalid accounting.");
  }

  return { outcome: "invalid" as const, accounting, cause };
}
