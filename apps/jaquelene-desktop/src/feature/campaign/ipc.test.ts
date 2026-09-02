import { ids, type Campaigns } from "@jaquelene/backend";
import type { ICampaignsImpl } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const implementations = vi.hoisted(() => ({
  campaigns: undefined as ICampaignsImpl | undefined,
}));

vi.mock("@jaquelene/ipc/main", () => ({
  CampaignPreferences: { for: vi.fn() },
  CampaignUsage: { for: vi.fn() },
  Campaigns: {
    for: () => ({
      setImplementation(implementation: ICampaignsImpl) {
        implementations.campaigns = implementation;
      },
    }),
  },
  ReasoningPreset: {
    Automatic: "automatic",
    On: "on",
    Off: "off",
    Minimal: "minimal",
    Low: "low",
    Medium: "medium",
    High: "high",
    XHigh: "xhigh",
    Max: "max",
  },
  UsageCostSource: { ProviderReported: "provider-reported", Estimated: "estimated" },
}));

import { exposeCampaigns } from "./ipc";

function campaignsStub(overrides: Partial<Campaigns> = {}): Campaigns {
  return {
    start: vi.fn<Campaigns["start"]>(),
    list: vi.fn<Campaigns["list"]>(() => ({ campaigns: [] })),
    get: vi.fn<Campaigns["get"]>(() => null),
    delete: vi.fn<Campaigns["delete"]>(() => null),
    rename: vi.fn<Campaigns["rename"]>(() => null),
    setGenerationPreferences: vi.fn<Campaigns["setGenerationPreferences"]>(() => null),
    ...overrides,
  };
}

function requireCampaignsImplementation() {
  if (!implementations.campaigns) {
    throw new Error("Campaign IPC implementation was not registered.");
  }

  return implementations.campaigns;
}

beforeEach(() => {
  implementations.campaigns = undefined;
});

describe("campaign IPC", () => {
  it("deletes campaigns through typed identities", () => {
    const deletion = { id: ids.campaign.create(), threadId: ids.thread.create() };
    const deleteCampaign = vi.fn<Campaigns["delete"]>(() => deletion);
    exposeCampaigns({} as WebFrameMain, campaignsStub({ delete: deleteCampaign }));

    expect(requireCampaignsImplementation().delete(deletion.id)).toEqual(deletion);
    expect(deleteCampaign).toHaveBeenCalledWith(deletion.id);
  });

  it("returns a missing deletion and rejects malformed identities", () => {
    const deleteCampaign = vi.fn<Campaigns["delete"]>(() => null);
    exposeCampaigns({} as WebFrameMain, campaignsStub({ delete: deleteCampaign }));
    const implementation = requireCampaignsImplementation();
    const missingId = ids.campaign.create();

    expect(implementation.delete(missingId)).toBeNull();
    expect(() => implementation.delete("invalid")).toThrow(TypeError);
    expect(deleteCampaign).toHaveBeenCalledOnce();
  });
});
