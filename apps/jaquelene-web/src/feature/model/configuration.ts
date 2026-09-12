import type {
  ModelConfigurationSelection,
  RequestedModelConfiguration,
} from "@jaquelene/ipc/renderer";

export function toRequestedModelConfiguration(
  configuration: ModelConfigurationSelection,
): RequestedModelConfiguration {
  const model = {
    providerId: configuration.model.providerId,
    modelId: configuration.model.modelId,
  };
  if (configuration.reasoningPreset === undefined) return { model };
  return { model, reasoningPreset: configuration.reasoningPreset };
}
