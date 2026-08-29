import { StorageAreaId, StorageCategory, type StorageArea } from "@jaquelene/backend";
import { join } from "node:path";
import Store, { type Schema } from "electron-store";
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
} satisfies Schema<PreferencesData>;

export function getPreferencesStoragePaths(userDataDirectory: string) {
  return [join(userDataDirectory, `${storeName}.json`)] as const;
}

export function createPreferencesStorageArea(
  userDataDirectory: string,
  preferences: Preferences,
): StorageArea {
  return {
    id: StorageAreaId.Preferences,
    category: StorageCategory.AppData,
    paths: getPreferencesStoragePaths(userDataDirectory),
    delete: preferences.deleteAll,
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

  return {
    appearance: {
      userInterface,
    },
    campaign,
    deleteAll: () => store.clear(),
  };
}

export type Preferences = ReturnType<typeof createPreferences>;
