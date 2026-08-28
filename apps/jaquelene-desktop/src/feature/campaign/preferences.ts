import type { Schema } from "electron-store";
import {
  requireModelSelection,
  type ModelReference,
  type ModelSelection,
} from "@/feature/model/catalog";

type CampaignModelPreference = ModelReference & Partial<Pick<ModelSelection, "name" | "brandId">>;

export type CampaignPreferenceValues = {
  defaultModel?: CampaignModelPreference;
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
        name: { type: "string", minLength: 1 },
        brandId: { type: "string", minLength: 1 },
      },
      required: ["providerId", "modelId"],
    },
  },
} satisfies Schema<{ campaign: CampaignPreferenceValues }>["campaign"];

export function createCampaignPreferences(storage: CampaignPreferencesStorage) {
  function getDefaultModel() {
    const defaultModel = storage.read()?.defaultModel;
    return defaultModel ? { ...defaultModel } : null;
  }

  return {
    getDefaultModel,

    setDefaultModel(selection: ModelSelection) {
      requireModelSelection(selection);

      const defaultModel = { ...selection };
      storage.write({ defaultModel });
      return { ...defaultModel };
    },
  };
}

export type CampaignPreferences = ReturnType<typeof createCampaignPreferences>;
