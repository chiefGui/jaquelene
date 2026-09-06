import type { Schema } from "electron-store";
import { requireModelSelection, type ModelSelection } from "@/feature/model/catalog";
import { modelSelectionStorageSchema } from "@/feature/model/selection-schema";

export type CampaignPreferenceValues = {
  defaultModel?: ModelSelection;
};

type CampaignPreferencesStorage = {
  read(): CampaignPreferenceValues | undefined;
  write(values: CampaignPreferenceValues): void;
};

export const campaignPreferencesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    defaultModel: modelSelectionStorageSchema,
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
