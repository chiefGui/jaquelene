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

export function requireReasoningEffort(effort: unknown): asserts effort is ReasoningEffort {
  if (typeof effort !== "string" || !(reasoningEfforts as readonly string[]).includes(effort)) {
    throw new TypeError(`Unknown reasoning effort "${String(effort)}".`);
  }
}

export type ModelReasoningCapability = Readonly<{
  required: boolean;
  defaultEffort?: ReasoningEffort;
  supportedEfforts?: readonly ReasoningEffort[];
}>;

export function requireModelReasoningCapability(
  candidate: unknown,
  description = "A model reasoning capability",
): ModelReasoningCapability {
  if (typeof candidate !== "object" || candidate === null) {
    throw new TypeError(`${description} must be an object.`);
  }

  const capability = candidate as Partial<ModelReasoningCapability>;

  if (typeof capability.required !== "boolean") {
    throw new TypeError(`${description} must declare whether reasoning is required.`);
  }

  const defaultEffort = capability.defaultEffort;

  if (defaultEffort !== undefined) {
    try {
      requireReasoningEffort(defaultEffort);
    } catch {
      throw new TypeError(`${description} has an invalid default effort.`);
    }
  }

  const candidateSupportedEfforts = capability.supportedEfforts;
  let supportedEfforts: ReasoningEffort[] | undefined;

  if (candidateSupportedEfforts !== undefined) {
    if (!Array.isArray(candidateSupportedEfforts) || candidateSupportedEfforts.length === 0) {
      throw new TypeError(`${description} must expose at least one supported effort.`);
    }

    const uniqueEfforts = new Set<ReasoningEffort>();

    for (const effort of candidateSupportedEfforts) {
      try {
        requireReasoningEffort(effort);
      } catch {
        throw new TypeError(`${description} has an invalid supported effort.`);
      }

      if (uniqueEfforts.has(effort)) {
        throw new TypeError(`${description} repeats supported effort "${effort}".`);
      }

      uniqueEfforts.add(effort);
    }

    supportedEfforts = [...uniqueEfforts];
  }

  if (capability.required && supportedEfforts?.includes("none")) {
    throw new TypeError(`${description} requires reasoning and cannot support "none".`);
  }

  if (capability.required && defaultEffort === "none") {
    throw new TypeError(`${description} requires reasoning and cannot default to "none".`);
  }

  if (
    defaultEffort !== undefined &&
    supportedEfforts &&
    !supportedEfforts.includes(defaultEffort)
  ) {
    throw new TypeError(`${description} has a default effort that is not supported.`);
  }

  return {
    required: capability.required,
    ...(defaultEffort === undefined ? {} : { defaultEffort }),
    ...(supportedEfforts ? { supportedEfforts } : {}),
  };
}

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
