import { ReasoningPreset } from "@jaquelene/ipc/renderer";
import type {
  Campaign,
  GenerationConfigurationSelection,
  ModelSelection,
} from "@jaquelene/ipc/renderer";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const campaignsIpc = vi.hoisted(() => ({
  get: vi.fn(),
  listForScenario: vi.fn(),
  setGenerationConfigurationOverride: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@jaquelene/ipc/renderer", () => ({
  Campaigns: campaignsIpc,
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
}));

import {
  campaignQuery,
  campaignsForScenarioQuery,
  setCampaignGenerationConfigurationOverrideMutationOptions,
} from "./query";

function modelSelection(id: string): ModelSelection {
  return {
    providerId: "provider-a",
    modelId: id,
    name: `Model ${id}`,
    brandId: "brand-a",
  };
}

function generationConfiguration(
  id: string,
  reasoningPresetOverride?: ReasoningPreset,
): GenerationConfigurationSelection {
  return {
    model: modelSelection(id),
    ...(reasoningPresetOverride === undefined ? {} : { reasoningPresetOverride }),
  };
}

function campaign(generationConfigurationOverride?: GenerationConfigurationSelection): Campaign {
  return {
    id: "campaign-a",
    scenarioId: "scenario-a",
    threadId: "thread-a",
    startedAt: 100,
    ...(generationConfigurationOverride ? { generationConfigurationOverride } : {}),
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
}

function deferred<Result>() {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("campaign generation configuration override mutation", () => {
  it("shows the override immediately and reconciles campaign caches", async () => {
    const queryClient = createQueryClient();
    const original = campaign();
    const requestedConfiguration = generationConfiguration("requested", ReasoningPreset.High);
    const saved = campaign({
      ...requestedConfiguration,
      model: { ...requestedConfiguration.model, name: "Saved model" },
    });
    const save = deferred<Campaign>();
    campaignsIpc.setGenerationConfigurationOverride.mockReturnValue(save.promise);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    queryClient.setQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey, [original]);
    const mutation = new MutationObserver(
      queryClient,
      setCampaignGenerationConfigurationOverrideMutationOptions(queryClient, original.id),
    );

    const result = mutation.mutate(requestedConfiguration);

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(
        campaign(requestedConfiguration),
      );
    });

    save.resolve(saved);

    await expect(result).resolves.toEqual(saved);
    expect(campaignsIpc.setGenerationConfigurationOverride).toHaveBeenCalledWith(
      original.id,
      requestedConfiguration,
    );
    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(saved);
    expect(
      queryClient.getQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey),
    ).toEqual([saved]);
  });

  it("returns a campaign to the global default immediately", async () => {
    const queryClient = createQueryClient();
    const original = campaign(generationConfiguration("override", ReasoningPreset.Low));
    const inherited = campaign();
    const save = deferred<Campaign>();
    campaignsIpc.setGenerationConfigurationOverride.mockReturnValue(save.promise);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    const mutation = new MutationObserver(
      queryClient,
      setCampaignGenerationConfigurationOverrideMutationOptions(queryClient, original.id),
    );

    const result = mutation.mutate(null);

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(inherited);
    });

    save.resolve(inherited);
    await expect(result).resolves.toEqual(inherited);
    expect(campaignsIpc.setGenerationConfigurationOverride).toHaveBeenCalledWith(original.id, null);
  });

  it("restores the previous campaign when saving fails", async () => {
    const queryClient = createQueryClient();
    const original = campaign(generationConfiguration("original", ReasoningPreset.Medium));
    const failure = new Error("Could not save the campaign model.");
    campaignsIpc.setGenerationConfigurationOverride.mockRejectedValue(failure);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    queryClient.setQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey, [original]);
    const mutation = new MutationObserver(
      queryClient,
      setCampaignGenerationConfigurationOverrideMutationOptions(queryClient, original.id),
    );

    await expect(
      mutation.mutate(generationConfiguration("requested", ReasoningPreset.Minimal)),
    ).rejects.toBe(failure);

    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(original);
    expect(
      queryClient.getQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey),
    ).toEqual([original]);
  });

  it("rejects an update when the campaign disappeared", async () => {
    const queryClient = createQueryClient();
    campaignsIpc.setGenerationConfigurationOverride.mockResolvedValue(null);
    const mutation = new MutationObserver(
      queryClient,
      setCampaignGenerationConfigurationOverrideMutationOptions(queryClient, "missing-campaign"),
    );

    await expect(mutation.mutate(generationConfiguration("requested"))).rejects.toThrow(
      'Campaign "missing-campaign" is unavailable.',
    );
  });
});
