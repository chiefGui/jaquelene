export type ModelIdentity = Readonly<{
  providerId: string;
  modelId: string;
}>;

export type RequestedModelConfiguration<Model, ReasoningPreset> = Readonly<{
  model: Model;
  reasoningPreset?: ReasoningPreset;
}>;

export type ModelReasoningOptions<ReasoningPreset> = Readonly<{
  defaultPreset: ReasoningPreset;
  supportedPresets: readonly ReasoningPreset[];
}>;
