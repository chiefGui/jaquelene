import { join } from "node:path";
import Store, { type Schema } from "electron-store";
import {
  createUserInterfacePreferences,
  type UserInterfacePreferenceValues,
  userInterfacePreferencesSchema,
} from "@/feature/appearance/user-interface/preferences";
import {
  createModelPreferences,
  type ModelPreferenceValues,
  modelPreferencesSchema,
} from "@/feature/model/preferences";

type PreferencesData = {
  appearance?: {
    userInterface?: UserInterfacePreferenceValues;
  };
  model?: ModelPreferenceValues;
};

const storeName = "preferences";

const schema = {
  appearance: {
    type: "object",
    additionalProperties: false,
    properties: {
      userInterface: userInterfacePreferencesSchema,
    },
  },
  model: modelPreferencesSchema,
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

  return {
    appearance: {
      userInterface: createUserInterfacePreferences({
        read: () => store.get("appearance")?.userInterface,
        write(userInterface) {
          store.set("appearance", { ...store.get("appearance"), userInterface });
        },
      }),
    },
    model: createModelPreferences({
      read: () => store.get("model"),
      write: (model) => store.set("model", model),
    }),
  };
}

export type Preferences = ReturnType<typeof createPreferences>;
