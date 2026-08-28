import { join } from "node:path";
import Store, { type Schema } from "electron-store";
import type { ModelReference } from "@/feature/model/catalog";

type PreferencesData = {
  defaultModel?: ModelReference;
};

const storeName = "preferences";

const schema = {
  defaultModel: {
    type: "object",
    additionalProperties: false,
    properties: {
      providerId: { type: "string", minLength: 1 },
      modelId: { type: "string", minLength: 1 },
    },
    required: ["providerId", "modelId"],
  },
} satisfies Schema<PreferencesData>;

export function getPreferencesStoragePaths(userDataDirectory: string) {
  return [join(userDataDirectory, `${storeName}.json`)] as const;
}

export function createPreferences(userDataDirectory: string) {
  const store = new Store<PreferencesData>({
    clearInvalidConfig: true,
    cwd: userDataDirectory,
    name: storeName,
    schema,
    rootSchema: { additionalProperties: false },
  });
  function getDefaultModel() {
    const defaultModel = store.get("defaultModel");
    return defaultModel ? { ...defaultModel } : undefined;
  }

  return {
    getDefaultModel,

    setDefaultModel(reference: ModelReference) {
      if (!reference.providerId.trim() || !reference.modelId.trim()) {
        throw new TypeError("A default model requires a provider and model identity.");
      }

      const defaultModel = { ...reference };
      store.set("defaultModel", defaultModel);
      return { ...defaultModel };
    },
  };
}

export type Preferences = ReturnType<typeof createPreferences>;
