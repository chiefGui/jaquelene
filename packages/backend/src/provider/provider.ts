import type { GenerationId, ThreadId } from "#backend/id";
import type { ModelInput } from "#backend/model/input";

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

export const reasoningEfforts = [
  "max",
  "xhigh",
  "high",
  "medium",
  "low",
  "minimal",
  "none",
] as const;

export type ReasoningEffort = (typeof reasoningEfforts)[number];

export function requireReasoningEffort(effort: string): asserts effort is ReasoningEffort {
  if (!(reasoningEfforts as readonly string[]).includes(effort)) {
    throw new TypeError(`Unknown reasoning effort "${effort}".`);
  }
}

export type ModelReasoningCapability = Readonly<{
  required: boolean;
  defaultEffort?: ReasoningEffort;
  supportedEfforts?: readonly ReasoningEffort[];
}>;

export type ProviderModel = Readonly<{
  id: string;
  name: string;
  brandId: string;
  reasoning?: ModelReasoningCapability;
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

export type GenerationConfiguration = Readonly<{
  model: ModelReference;
  reasoningEffort?: ReasoningEffort;
}>;

export function requireGenerationConfiguration(configuration: GenerationConfiguration) {
  requireModelReference(configuration.model);

  if (configuration.reasoningEffort !== undefined) {
    requireReasoningEffort(configuration.reasoningEffort);
  }
}

export type GenerationConfigurationSelection = Readonly<{
  model: ModelSelection;
  reasoningEffort?: ReasoningEffort;
}>;

export function requireGenerationConfigurationSelection(
  configuration: GenerationConfigurationSelection,
) {
  requireModelSelection(configuration.model);

  if (configuration.reasoningEffort !== undefined) {
    requireReasoningEffort(configuration.reasoningEffort);
  }
}

export type GenerationUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}>;

export type ProviderGenerationRequest = Readonly<{
  generationId: GenerationId;
  threadId: ThreadId;
  modelId: string;
  input: ModelInput;
  reasoningEffort?: ReasoningEffort;
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

export type ApiKeyProviderConfigurationSnapshot =
  | Readonly<{ state: "unconfigured" }>
  | Readonly<{ state: "configured"; revision: string; keyLabel?: string }>;

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
