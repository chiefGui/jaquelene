import { StorageAreaDeleteError, StorageCategory, type StorageArea } from "@jaquelene/backend";
import { Context, Effect, Layer } from "effect";
import { join } from "node:path";
import Store, { type Schema } from "electron-store";
import { deleteStoreFile } from "@/storage/delete-store-file";
import {
  createDiagnosticsPreferences,
  diagnosticsPreferencesSchema,
  type DiagnosticsPreferenceValues,
} from "@/diagnostics/preferences";
import {
  createUserInterfacePreferences,
  type UserInterfacePreferenceValues,
  userInterfacePreferencesSchema,
} from "@/feature/appearance/user-interface/preferences";
import {
  createCampaignPreferences,
  type CampaignPreferenceValues,
  campaignPreferencesSchema,
} from "@/feature/campaign/preferences";

type PreferencesData = {
  appearance?: {
    userInterface?: UserInterfacePreferenceValues;
  };
  campaign?: CampaignPreferenceValues;
  diagnostics?: DiagnosticsPreferenceValues;
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
  campaign: campaignPreferencesSchema,
  diagnostics: diagnosticsPreferencesSchema,
} satisfies Schema<PreferencesData>;

export function getPreferencesStoragePaths(userDataDirectory: string) {
  return [join(userDataDirectory, `${storeName}.json`)] as const;
}

export function createPreferencesStorageArea(
  userDataDirectory: string,
): StorageArea<PreferencesService> {
  const id = "preferences";
  return {
    id,
    category: StorageCategory.AppData,
    paths: getPreferencesStoragePaths(userDataDirectory),
    delete: PreferencesService.use((preferences) =>
      Effect.try({
        try: () => preferences.deleteAll(),
        catch: (cause) => new StorageAreaDeleteError({ areaId: id, cause }),
      }),
    ),
  };
}

export function createPreferences(userDataDirectory: string) {
  const store = new Store<PreferencesData>({
    clearInvalidConfig: true,
    cwd: userDataDirectory,
    name: storeName,
    schema,
    rootSchema: { additionalProperties: false },
  });

  const userInterface = createUserInterfacePreferences({
    read: () => store.get("appearance")?.userInterface,
    write(userInterface) {
      store.set("appearance", { ...store.get("appearance"), userInterface });
    },
    subscribe: (listener) => store.onDidChange("appearance.userInterface", listener),
  });
  const campaign = createCampaignPreferences({
    read: () => store.get("campaign"),
    write: (campaign) => store.set("campaign", campaign),
  });
  const diagnostics = createDiagnosticsPreferences({
    read: () => store.get("diagnostics"),
    write: (values) => store.set("diagnostics", values),
  });

  return {
    appearance: {
      userInterface,
    },
    campaign,
    diagnostics,
    deleteAll: () => deleteStoreFile(store),
  };
}

export type Preferences = ReturnType<typeof createPreferences>;

export class PreferencesService extends Context.Service<PreferencesService, Preferences>()(
  "@jaquelene/desktop/preferences/Preferences",
) {
  static readonly layer = (preferences: Preferences) => Layer.succeed(this, this.of(preferences));
}
