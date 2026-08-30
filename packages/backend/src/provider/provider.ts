import type { GenerationId, ThreadId } from "#backend/id";

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
  tokenPricing?: Readonly<{
    inputUsdPerMillion: number;
    outputUsdPerMillion: number;
  }>;
}>;

export type ModelSelection = ModelReference & Pick<ProviderModel, "brandId" | "name">;

export function requireModelSelection(selection: ModelSelection) {
  requireModelReference(selection);

  if (!selection.name.trim() || !selection.brandId.trim()) {
    throw new TypeError("A model selection requires display metadata.");
  }
}

export type GenerationMessage = Readonly<{
  role: "system" | "user" | "assistant";
  content: string;
}>;

export type GenerationUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}>;

export type ProviderGenerationRequest = Readonly<{
  generationId: GenerationId;
  threadId: ThreadId;
  modelId: string;
  messages: readonly GenerationMessage[];
}>;

export type ProviderGenerationResult = Readonly<{
  text: string;
  providerGenerationId?: string;
  resolvedModelId?: string;
  finishReason?: string;
  usage?: GenerationUsage;
}>;

export type ApiKeyProviderConfiguration =
  | Readonly<{ state: "unconfigured" }>
  | Readonly<{ state: "configured"; keyLabel?: string }>;

export type ProviderConfiguration =
  | (ApiKeyProviderConfiguration & Readonly<{ kind: "api-key" }>)
  | Readonly<{ kind: "none"; state: "configured" }>;

export type ProviderConfigureResult =
  | Readonly<{ state: "configured"; keyLabel?: string }>
  | Readonly<{ state: "rejected" }>
  | Readonly<{ state: "unavailable" }>;

export type ProviderConfigurationAdapter =
  | Readonly<{
      kind: "api-key";
      inspect: () => ApiKeyProviderConfiguration;
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
}>;
