import type { Schema } from "electron-store";
import { requireModelReference, type ModelReference } from "./catalog";

export type ModelPreferenceValues = {
  default?: ModelReference;
};

type ModelPreferencesStorage = {
  read(): ModelPreferenceValues | undefined;
  write(values: ModelPreferenceValues): void;
};

export const modelPreferencesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    default: {
      type: "object",
      additionalProperties: false,
      properties: {
        providerId: { type: "string", minLength: 1 },
        modelId: { type: "string", minLength: 1 },
      },
      required: ["providerId", "modelId"],
    },
  },
} satisfies Schema<{ model: ModelPreferenceValues }>["model"];

export function createModelPreferences(storage: ModelPreferencesStorage) {
  function get(): ModelPreferenceValues {
    const defaultModel = storage.read()?.default;
    return defaultModel ? { default: { ...defaultModel } } : {};
  }

  return {
    get,

    setDefault(reference: ModelReference) {
      requireModelReference(reference);

      const values = { ...get(), default: { ...reference } };
      storage.write(values);
      return { ...values, default: { ...values.default } };
    },
  };
}

export type ModelPreferences = ReturnType<typeof createModelPreferences>;
