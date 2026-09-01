import { ids, type Campaign, type Campaigns } from "@jaquelene/backend";
import {
  CampaignPreferences as CampaignPreferencesIpc,
  Campaigns as CampaignsIpc,
  type CampaignGenerationPreferences as IpcCampaignGenerationPreferences,
  type Campaign as IpcCampaign,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import { fromIpcReasoningPreset, toIpcReasoningPreset } from "@/feature/model/reasoning-preset";
import type { CampaignPreferences } from "./preferences";

function toIpcCampaign(campaign: Campaign): IpcCampaign {
  const { generationPreferences: preferences, ...campaignSnapshot } = campaign;
  return {
    ...campaignSnapshot,
    ...(preferences
      ? {
          generationPreferences: {
            ...(preferences.model ? { model: { ...preferences.model } } : {}),
            ...(preferences.reasoningPreset === undefined
              ? {}
              : {
                  reasoningPreset: toIpcReasoningPreset(preferences.reasoningPreset),
                }),
          },
        }
      : {}),
  };
}

function fromIpcPreferences(preferences: IpcCampaignGenerationPreferences) {
  return {
    ...(preferences.model ? { model: { ...preferences.model } } : {}),
    ...(preferences.reasoningPreset === undefined
      ? {}
      : {
          reasoningPreset: fromIpcReasoningPreset(preferences.reasoningPreset),
        }),
  };
}

export function exposeCampaigns(target: WebFrameMain, campaigns: Campaigns) {
  CampaignsIpc.for(target).setImplementation({
    start(id) {
      return toIpcCampaign(campaigns.start(ids.scenario.parse(id)));
    },
    listForScenario(id) {
      return campaigns.listForScenario(ids.scenario.parse(id)).map(toIpcCampaign);
    },
    get(id) {
      const campaign = campaigns.get(ids.campaign.parse(id));
      return campaign ? toIpcCampaign(campaign) : null;
    },
    setGenerationPreferences(id, preferences) {
      const campaign = campaigns.setGenerationPreferences(
        ids.campaign.parse(id),
        preferences ? fromIpcPreferences(preferences) : null,
      );
      return campaign ? toIpcCampaign(campaign) : null;
    },
  });
}

export function exposeCampaignPreferences(target: WebFrameMain, preferences: CampaignPreferences) {
  CampaignPreferencesIpc.for(target).setImplementation({
    getDefaultModel: preferences.getDefaultModel,
    setDefaultModel: preferences.setDefaultModel,
  });
}
