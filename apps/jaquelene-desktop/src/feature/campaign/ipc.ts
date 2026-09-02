import {
  ids,
  type Campaign,
  type Campaigns,
  type CampaignUsage as BackendCampaignUsage,
  type CampaignUsageReader,
} from "@jaquelene/backend";
import { promptKeySchema, promptKindKeySchema } from "@jaquelene/domain";
import {
  CampaignPreferences as CampaignPreferencesIpc,
  Campaigns as CampaignsIpc,
  CampaignUsage as CampaignUsageIpc,
  UsageCostSource,
  type CampaignGenerationPreferences as IpcCampaignGenerationPreferences,
  type Campaign as IpcCampaign,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import { fromIpcReasoningPreset, toIpcReasoningPreset } from "@/feature/model/reasoning-preset";
import type { CampaignPreferences } from "./preferences";

function toIpcCostSource(source: BackendCampaignUsage["costs"][number]["source"]) {
  switch (source) {
    case "provider-reported":
      return UsageCostSource.ProviderReported;
    case "estimated":
      return UsageCostSource.Estimated;
  }

  const unsupportedSource: never = source;
  throw new TypeError(`Unsupported campaign cost source: ${String(unsupportedSource)}`);
}

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
    start({ title, composition }) {
      return toIpcCampaign(
        campaigns.start({
          title,
          composition: composition.map(({ kind, promptKey }) => ({
            kind: promptKindKeySchema.parse(kind),
            ...(promptKey ? { promptKey: promptKeySchema.parse(promptKey) } : {}),
          })),
        }),
      );
    },
    list(request) {
      const page = campaigns.list(request);
      return {
        campaigns: page.campaigns.map(toIpcCampaign),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    },
    get(id) {
      const campaign = campaigns.get(ids.campaign.parse(id));
      return campaign ? toIpcCampaign(campaign) : null;
    },
    rename({ id, title }) {
      const campaign = campaigns.rename(ids.campaign.parse(id), title);
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

export function exposeCampaignUsage(target: WebFrameMain, usage: CampaignUsageReader) {
  CampaignUsageIpc.for(target).setImplementation({
    get(id) {
      const snapshot = usage.get(ids.campaign.parse(id));

      if (!snapshot) {
        return null;
      }

      return {
        ...snapshot,
        costs: snapshot.costs.map((cost) => ({
          ...cost,
          source: toIpcCostSource(cost.source),
        })),
        models: snapshot.models.map((model) => ({ ...model })),
      };
    },
  });
}

export function exposeCampaignPreferences(target: WebFrameMain, preferences: CampaignPreferences) {
  CampaignPreferencesIpc.for(target).setImplementation({
    getDefaultModel: preferences.getDefaultModel,
    setDefaultModel: preferences.setDefaultModel,
  });
}
