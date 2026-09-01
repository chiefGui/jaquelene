import { ids, type Campaign, type Campaigns } from "@jaquelene/backend";
import {
  CampaignPreferences as CampaignPreferencesIpc,
  Campaigns as CampaignsIpc,
  type Campaign as IpcCampaign,
  type GenerationConfigurationSelection as IpcGenerationConfigurationSelection,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import { fromIpcReasoningPreset, toIpcReasoningPreset } from "@/feature/model/reasoning-preset";
import type { CampaignPreferences } from "./preferences";

function toIpcCampaign(campaign: Campaign): IpcCampaign {
  const { generationConfigurationOverride: configuration, ...campaignSnapshot } = campaign;
  return {
    ...campaignSnapshot,
    ...(configuration
      ? {
          generationConfigurationOverride: {
            model: { ...configuration.model },
            ...(configuration.reasoningPresetOverride === undefined
              ? {}
              : {
                  reasoningPresetOverride: toIpcReasoningPreset(
                    configuration.reasoningPresetOverride,
                  ),
                }),
          },
        }
      : {}),
  };
}

function fromIpcConfiguration(configuration: IpcGenerationConfigurationSelection) {
  return {
    model: { ...configuration.model },
    ...(configuration.reasoningPresetOverride === undefined
      ? {}
      : {
          reasoningPresetOverride: fromIpcReasoningPreset(configuration.reasoningPresetOverride),
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
    setGenerationConfigurationOverride(id, configuration) {
      const campaign = campaigns.setGenerationConfigurationOverride(
        ids.campaign.parse(id),
        configuration ? fromIpcConfiguration(configuration) : null,
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
