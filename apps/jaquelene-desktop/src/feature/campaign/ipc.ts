import { ids, type Campaigns } from "@jaquelene/backend";
import {
  CampaignPreferences as CampaignPreferencesIpc,
  Campaigns as CampaignsIpc,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { CampaignPreferences } from "./preferences";

export function exposeCampaigns(target: WebFrameMain, campaigns: Campaigns) {
  CampaignsIpc.for(target).setImplementation({
    start(id) {
      return campaigns.start(ids.scenario.parse(id));
    },
    listForScenario(id) {
      return campaigns.listForScenario(ids.scenario.parse(id));
    },
    get(id) {
      return campaigns.get(ids.campaign.parse(id));
    },
    setModelOverride(id, model) {
      return campaigns.setModelOverride(ids.campaign.parse(id), model);
    },
  });
}

export function exposeCampaignPreferences(target: WebFrameMain, preferences: CampaignPreferences) {
  CampaignPreferencesIpc.for(target).setImplementation({
    getDefaultModel: preferences.getDefaultModel,
    setDefaultModel: preferences.setDefaultModel,
  });
}
