import type {
  ModelIdentity,
  ModelReasoningOptions,
  RequestedModelConfiguration,
} from "../model/configuration";

export type CampaignGenerationPreferences<Model, ReasoningPreset> = Readonly<{
  model?: Model;
  reasoningPreset?: ReasoningPreset;
}>;

function sameModel(left: ModelIdentity, right: ModelIdentity) {
  return left.providerId === right.providerId && left.modelId === right.modelId;
}

function campaignPreferences<Model, ReasoningPreset>(
  model: Model | undefined,
  reasoningPreset: ReasoningPreset | undefined,
): CampaignGenerationPreferences<Model, ReasoningPreset> | undefined {
  if (model === undefined && reasoningPreset === undefined) {
    return undefined;
  }

  const preferences: {
    model?: Model;
    reasoningPreset?: ReasoningPreset;
  } = {};

  if (model !== undefined) {
    preferences.model = model;
  }

  if (reasoningPreset !== undefined) {
    preferences.reasoningPreset = reasoningPreset;
  }

  return preferences;
}

function supportedReasoningPreference<ReasoningPreset>(
  reasoningPreset: ReasoningPreset | undefined,
  reasoning: ModelReasoningOptions<ReasoningPreset> | undefined,
) {
  if (
    reasoningPreset === undefined ||
    reasoning?.defaultPreset === reasoningPreset ||
    !reasoning?.supportedPresets.includes(reasoningPreset)
  ) {
    return undefined;
  }

  return reasoningPreset;
}

export function composeCampaignGenerationConfiguration<
  Model extends ModelIdentity,
  ReasoningPreset,
>(
  defaultModel: Model | null,
  preferences: CampaignGenerationPreferences<Model, ReasoningPreset> | undefined,
): RequestedModelConfiguration<Model, ReasoningPreset> | null {
  const model = preferences?.model ?? defaultModel;

  if (!model) {
    return null;
  }

  if (preferences?.reasoningPreset === undefined) {
    return { model };
  }

  return { model, reasoningPreset: preferences.reasoningPreset };
}

export function setCampaignGenerationModel<Model extends ModelIdentity, ReasoningPreset>(
  preferences: CampaignGenerationPreferences<Model, ReasoningPreset> | undefined,
  model: Model,
  defaultModel: Model | null,
  reasoning: ModelReasoningOptions<ReasoningPreset> | undefined,
): CampaignGenerationPreferences<Model, ReasoningPreset> | undefined {
  let modelPreference: Model | undefined = model;

  if (defaultModel && sameModel(model, defaultModel)) {
    modelPreference = undefined;
  }
  const reasoningPreset = supportedReasoningPreference(preferences?.reasoningPreset, reasoning);

  return campaignPreferences(modelPreference, reasoningPreset);
}

export function setCampaignGenerationReasoningPreset<Model, ReasoningPreset>(
  preferences: CampaignGenerationPreferences<Model, ReasoningPreset> | undefined,
  reasoningPreset: ReasoningPreset | undefined,
  reasoning: ModelReasoningOptions<ReasoningPreset> | undefined,
): CampaignGenerationPreferences<Model, ReasoningPreset> | undefined {
  if (reasoningPreset !== undefined && !reasoning?.supportedPresets.includes(reasoningPreset)) {
    throw new RangeError("The selected model does not support this reasoning preset.");
  }

  return campaignPreferences(
    preferences?.model,
    supportedReasoningPreference(reasoningPreset, reasoning),
  );
}
