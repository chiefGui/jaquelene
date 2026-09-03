import type { GenerationId, ThreadId } from "#backend/id";
import type { ModelInput } from "#backend/model/input";
import type { ModelReasoningCapability, ResolvedReasoning } from "#backend/model/reasoning";

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

export type ProviderGenerationRequest = Readonly<{
  generationId: GenerationId;
  threadId: ThreadId;
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

export type ApiKeyProviderConfiguration =
  | Readonly<{ state: "unconfigured" }>
  | Readonly<{ state: "configured"; keyLabel: string }>;

export type ApiKeyProviderConfigurationSnapshot =
  | Readonly<{ state: "unconfigured" }>
  | Readonly<{ state: "configured"; revision: string; keyLabel: string }>;

export type ProviderConfiguration =
  | (ApiKeyProviderConfiguration & Readonly<{ kind: "api-key" }>)
  | Readonly<{ kind: "none"; state: "configured" }>;

export type ProviderConfigureResult =
  | Readonly<{ state: "configured"; keyLabel: string }>
  | Readonly<{ state: "rejected" }>
  | Readonly<{ state: "unavailable" }>;

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
