import { requireModelSelection, type ModelSelection } from "@jaquelene/backend";
import type { Schema } from "electron-store";

export type AiActionPreferenceValues = { model?: ModelSelection };

export const aiActionPreferencesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    model: {
      type: "object",
      additionalProperties: false,
      properties: {
        providerId: { type: "string", minLength: 1 },
        modelId: { type: "string", minLength: 1 },
        name: { type: "string", minLength: 1 },
        brandId: { type: "string", minLength: 1 },
      },
      required: ["providerId", "modelId", "name", "brandId"],
    },
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
