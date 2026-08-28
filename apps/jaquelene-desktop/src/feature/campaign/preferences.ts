import type { Schema } from "electron-store";
import { requireModelReference, type ModelReference } from "@/feature/model/catalog";

export type CampaignPreferenceValues = {
  defaultModel?: ModelReference;
};

type CampaignPreferencesStorage = {
  read(): CampaignPreferenceValues | undefined;
  write(values: CampaignPreferenceValues): void;
};

export const campaignPreferencesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    defaultModel: {
      type: "object",
      additionalProperties: false,
      properties: {
        providerId: { type: "string", minLength: 1 },
        modelId: { type: "string", minLength: 1 },
      },
      required: ["providerId", "modelId"],
    },
  },
} satisfies Schema<{ campaign: CampaignPreferenceValues }>["campaign"];

export function createCampaignPreferences(storage: CampaignPreferencesStorage) {
  function getDefaultModel() {
    const reference = storage.read()?.defaultModel;
    return reference ? { ...reference } : null;
  }

  return {
    getDefaultModel,

    setDefaultModel(reference: ModelReference) {
      requireModelReference(reference);

      const defaultModel = { ...reference };
      storage.write({ defaultModel });
      return { ...defaultModel };
    },
  };
}

export type CampaignPreferences = ReturnType<typeof createCampaignPreferences>;
