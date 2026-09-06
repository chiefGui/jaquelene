import { ids, type Campaigns } from "@jaquelene/backend";
import { parseCampaignTitle } from "@jaquelene/domain";
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
    setScenario: vi.fn<Campaigns["setScenario"]>(() => null),
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
  it("passes exact opening and scenario content through campaign creation", () => {
    const campaign = {
      id: ids.campaign.create(),
      title: parseCampaignTitle("A city"),
      scenario: "A city beneath the sea.",
      threadId: ids.thread.create(),
      startedAt: 1,
      lastActivityAt: 1,
      turnCount: 0,
    };
    const start = vi.fn<Campaigns["start"]>(() => campaign);
    const setScenario = vi.fn<Campaigns["setScenario"]>(() => ({ ...campaign, scenario: "" }));
    exposeCampaigns({} as WebFrameMain, campaignsStub({ start, setScenario }));
    const implementation = requireCampaignsImplementation();
    const input = {
      title: "A city",
      scenario: campaign.scenario,
      openingScene: "  John wakes up.\nSomeone knocks.\n",
      composition: [],
    };
    expect(implementation.start(input)).toEqual(campaign);
    expect(start).toHaveBeenCalledWith(input);
    expect(implementation.setScenario({ id: campaign.id, scenario: "" })).toEqual({
      ...campaign,
      scenario: "",
    });
    expect(setScenario).toHaveBeenCalledWith(campaign.id, "");
    expect(() => implementation.setScenario({ id: "invalid", scenario: "" })).toThrow(TypeError);
  });

  it("returns missing campaigns when updating a scenario", () => {
    exposeCampaigns({} as WebFrameMain, campaignsStub());
    expect(
      requireCampaignsImplementation().setScenario({ id: ids.campaign.create(), scenario: "" }),
    ).toBeNull();
  });

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
