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
    campaign: createCampaignPreferences({
      read: () => store.get("campaign"),
      write: (campaign) => store.set("campaign", campaign),
    }),
  };
}

export type Preferences = ReturnType<typeof createPreferences>;
