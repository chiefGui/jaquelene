import type { Schema } from "electron-store";
import { requireModelSelection, type ModelSelection } from "@/feature/model/catalog";
import { modelSelectionStorageSchema } from "@/feature/model/selection-schema";

export type RegenerationPreferenceValues = {
  defaultModel?: ModelSelection;
};

export const regenerationPreferencesSchema = {
  type: "object",
  additionalProperties: false,
  properties: { defaultModel: modelSelectionStorageSchema },
} satisfies Schema<{ regeneration: RegenerationPreferenceValues }>["regeneration"];

export function createRegenerationPreferences(storage: {
  read(): RegenerationPreferenceValues | undefined;
  write(values: RegenerationPreferenceValues): void;
}) {
  return {
    getDefaultModel() {
      const model = storage.read()?.defaultModel;
      if (model === undefined) {
        return null;
      }
      return { ...model };
    },
    setDefaultModel(selection: ModelSelection) {
      requireModelSelection(selection);
      const defaultModel = { ...selection };
      storage.write({ defaultModel });
      return { ...defaultModel };
    },
  };
}

export type RegenerationPreferences = ReturnType<typeof createRegenerationPreferences>;
