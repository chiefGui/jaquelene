import { requireModelSelection, type ModelSelection } from "@jaquelene/backend";
import type { Schema } from "electron-store";
import { modelSelectionSchema } from "@/feature/model/selection-schema";

export type AiActionPreferenceValues = { model?: ModelSelection };

export const aiActionPreferencesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    model: modelSelectionSchema,
  },
} satisfies Schema<{ aiAction: AiActionPreferenceValues }>["aiAction"];

export function createAiActionPreferences(storage: {
  read: () => AiActionPreferenceValues | undefined;
  write: (values: AiActionPreferenceValues) => void;
}) {
  return {
    getModel(): ModelSelection | null {
      const model = storage.read()?.model;
      if (!model) {
        return null;
      }
      return { ...model };
    },
    setModel(model: ModelSelection | null): ModelSelection | null {
      if (model === null) {
        storage.write({});
        return null;
      }
      requireModelSelection(model);
      storage.write({ model: { ...model } });
      return { ...model };
    },
  };
}

export type AiActionPreferences = ReturnType<typeof createAiActionPreferences>;
