import type { ApiKeyProviderConfiguration, ProviderConfigureResult } from "@jaquelene/domain";
import type { ModelInput } from "#backend/model/input";
import type { ModelReasoningCapability, ResolvedReasoning } from "#backend/model/reasoning";

export type {
  ApiKeyProviderConfiguration,
  ProviderConfiguration,
  ProviderConfigureResult,
} from "@jaquelene/domain";

export type ProviderId = string;

export type ProviderDescriptor = Readonly<{
  id: ProviderId;
  name: string;
  brandId: string;
}>;

export type ModelReference = Readonly<{
  providerId: ProviderId;
  modelId: string;
}>;

export function requireModelReference(reference: ModelReference) {
  if (!reference.providerId.trim() || !reference.modelId.trim()) {
    throw new TypeError("A model reference requires provider and model identities.");
  }
}

export type ProviderModel = Readonly<{
  id: string;
  name: string;
  brandId: string;
  contextWindowTokens?: number;
  reasoning?: ModelReasoningCapability;
  tokenPricing?: Readonly<{
    inputUsdPerMillion: number;
    outputUsdPerMillion: number;
  }>;
}>;

type ProviderModelInput = Readonly<
  Pick<ProviderModel, "brandId" | "id" | "name"> & {
    contextWindowTokens: ProviderModel["contextWindowTokens"];
    reasoning: ProviderModel["reasoning"];
    tokenPricing: ProviderModel["tokenPricing"];
  }
>;

type MutableProviderModel = { -readonly [Key in keyof ProviderModel]: ProviderModel[Key] };

export function createProviderModel(input: ProviderModelInput): ProviderModel {
  const model: MutableProviderModel = {
    brandId: input.brandId,
    id: input.id,
    name: input.name,
  };

  if (input.contextWindowTokens !== undefined) {
    model.contextWindowTokens = input.contextWindowTokens;
  }

  if (input.reasoning !== undefined) {
    model.reasoning = input.reasoning;
  }

  if (input.tokenPricing !== undefined) {
    model.tokenPricing = input.tokenPricing;
  }

  return model;
}

export function requireContextWindowTokens(value: unknown, description: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${description} must be a positive safe integer.`);
  }

  return value;
}

export type ModelSelection = ModelReference & Pick<ProviderModel, "brandId" | "name">;

export function requireModelSelection(selection: ModelSelection) {
  requireModelReference(selection);

  if (!selection.name.trim() || !selection.brandId.trim()) {
    throw new TypeError("A model selection requires display metadata.");
  }
}

export type GenerationTokenUsage = Readonly<{
  input: Readonly<{
    total: number;
    cacheRead?: number;
    cacheWrite?: number;
  }>;
  output: Readonly<{
    total: number;
    reasoning?: number;
  }>;
  total: number;
}>;

export const generationCostSources = ["provider-reported", "estimated"] as const;
export type GenerationCostSource = (typeof generationCostSources)[number];

export type GenerationCost = Readonly<{
  currency: string;
  amountNanos: number;
  source: GenerationCostSource;
}>;

export type GenerationUsage = Readonly<{
  tokens: GenerationTokenUsage;
  cost?: GenerationCost;
}>;

type GenerationUsageInput = Readonly<{
  inputTotal: number;
  inputCacheRead: number | undefined;
  inputCacheWrite: number | undefined;
  outputTotal: number;
  outputReasoning: number | undefined;
  total: number;
  cost: GenerationCost | undefined;
}>;

export function createGenerationUsage(input: GenerationUsageInput): GenerationUsage {
  const inputTokens: {
    total: number;
    cacheRead?: number;
    cacheWrite?: number;
  } = { total: input.inputTotal };
  const outputTokens: {
    total: number;
    reasoning?: number;
  } = { total: input.outputTotal };
  const usage: {
    tokens: GenerationTokenUsage;
    cost?: GenerationCost;
  } = {
    tokens: {
      input: inputTokens,
      output: outputTokens,
      total: input.total,
    },
  };

  if (input.inputCacheRead !== undefined) {
    inputTokens.cacheRead = input.inputCacheRead;
  }

  if (input.inputCacheWrite !== undefined) {
    inputTokens.cacheWrite = input.inputCacheWrite;
  }

  if (input.outputReasoning !== undefined) {
    outputTokens.reasoning = input.outputReasoning;
  }

  if (input.cost !== undefined) {
    usage.cost = input.cost;
  }

  return usage;
}

export type ProviderGenerationRequest = Readonly<{
  executionId: string;
  groupId?: string;
  modelId: string;
  input: ModelInput;
  reasoning?: ResolvedReasoning;
}>;

export type ProviderGenerationResult = Readonly<{
  text: string;
  providerGenerationId?: string;
  resolvedModelId?: string;
  upstreamProviderId?: string;
  finishReason?: string;
  usage?: GenerationUsage;
}>;

type ProviderGenerationResultInput = Readonly<{
  text: string;
  providerGenerationId: string | undefined;
  resolvedModelId: string | undefined;
  upstreamProviderId: string | undefined;
  finishReason: string | undefined;
  usage: GenerationUsage | undefined;
}>;

type MutableProviderGenerationResult = {
  -readonly [Key in keyof ProviderGenerationResult]: ProviderGenerationResult[Key];
};

export function createProviderGenerationResult(
  input: ProviderGenerationResultInput,
): ProviderGenerationResult {
  const result: MutableProviderGenerationResult = { text: input.text };

  if (input.providerGenerationId !== undefined) {
    result.providerGenerationId = input.providerGenerationId;
  }

  if (input.resolvedModelId !== undefined) {
    result.resolvedModelId = input.resolvedModelId;
  }

  if (input.upstreamProviderId !== undefined) {
    result.upstreamProviderId = input.upstreamProviderId;
  }

  if (input.finishReason !== undefined) {
    result.finishReason = input.finishReason;
  }

  if (input.usage !== undefined) {
    result.usage = input.usage;
  }

  return result;
}

export type ApiKeyProviderConfigurationSnapshot =
  | Extract<ApiKeyProviderConfiguration, { state: "unconfigured" }>
  | Readonly<Extract<ApiKeyProviderConfiguration, { state: "configured" }> & { revision: string }>;

export type ProviderConfigurationAdapter =
  | Readonly<{
      kind: "api-key";
      inspect: () => ApiKeyProviderConfigurationSnapshot;
      configure: (apiKey: string, signal: AbortSignal) => Promise<ProviderConfigureResult>;
      clear: () => Promise<void>;
      storagePaths: readonly string[];
    }>
  | Readonly<{
      kind: "none";
    }>;

export type ProviderModelsAdapter = Readonly<{
  list: (signal: AbortSignal) => Promise<readonly ProviderModel[]>;
}>;

export type ProviderGenerationAdapter = Readonly<{
  generate: (
    request: ProviderGenerationRequest,
    signal: AbortSignal,
  ) => Promise<ProviderGenerationResult>;
}>;

export type ProviderAdapter = Readonly<{
  descriptor: ProviderDescriptor;
  configuration: ProviderConfigurationAdapter;
  models: ProviderModelsAdapter;
  generation: ProviderGenerationAdapter;
  [Symbol.dispose]?: () => void;
  [Symbol.asyncDispose]?: () => PromiseLike<void>;
}>;

export type ProviderFactory = Readonly<{
  id: ProviderId;
  storagePaths: readonly string[];
  create: (signal: AbortSignal) => ProviderAdapter | PromiseLike<ProviderAdapter>;
}>;
