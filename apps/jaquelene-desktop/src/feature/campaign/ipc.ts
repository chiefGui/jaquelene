import {
  CampaignPreferences as CampaignPreferencesIpc,
  Campaigns as CampaignsIpc,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { Campaigns } from "./campaigns";
import type { CampaignPreferences } from "./preferences";

export function exposeCampaigns(target: WebFrameMain, campaigns: Campaigns) {
  CampaignsIpc.for(target).setImplementation(campaigns);
}

export function exposeCampaignPreferences(target: WebFrameMain, preferences: CampaignPreferences) {
  CampaignPreferencesIpc.for(target).setImplementation({
    getDefaultModel: preferences.getDefaultModel,
    setDefaultModel: preferences.setDefaultModel,
  });
}
