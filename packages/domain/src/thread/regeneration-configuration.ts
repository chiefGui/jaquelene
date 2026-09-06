import type { RequestedModelConfiguration } from "../model/configuration";

export function composeRegenerationConfiguration<Model, ReasoningPreset>(
  defaultModel: Model | null,
  campaignConfiguration: RequestedModelConfiguration<Model, ReasoningPreset> | null,
): RequestedModelConfiguration<Model, ReasoningPreset> | null {
  if (defaultModel === null) {
    return campaignConfiguration;
  }

  // A regeneration default is independent of the campaign's reasoning settings.
  return { model: defaultModel };
}
