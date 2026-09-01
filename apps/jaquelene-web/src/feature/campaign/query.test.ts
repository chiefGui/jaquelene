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
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Result>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function observeConfigurationMutation(queryClient: QueryClient, id: string) {
  return new MutationObserver(
    queryClient,
    setCampaignGenerationConfigurationOverrideMutationOptions(queryClient, id),
  );
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
    const mutation = observeConfigurationMutation(queryClient, original.id);

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
    const mutation = observeConfigurationMutation(queryClient, original.id);

    const result = mutation.mutate(null);

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(inherited);
    });

    save.resolve(inherited);
    await expect(result).resolves.toEqual(inherited);
    expect(campaignsIpc.setGenerationConfigurationOverride).toHaveBeenCalledWith(original.id, null);
  });

  it("keeps the latest optimistic configuration while ordered saves settle", async () => {
    const queryClient = createQueryClient();
    const original = campaign();
    const firstConfiguration = generationConfiguration("first", ReasoningPreset.On);
    const latestConfiguration = generationConfiguration("latest", ReasoningPreset.Off);
    const firstSaved = campaign(firstConfiguration);
    const latestSaved = campaign(latestConfiguration);
    const firstSave = deferred<Campaign>();
    const latestSave = deferred<Campaign>();
    campaignsIpc.setGenerationConfigurationOverride
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(latestSave.promise);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    queryClient.setQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey, [original]);
    const mutation = observeConfigurationMutation(queryClient, original.id);

    const firstResult = mutation.mutate(firstConfiguration);
    const latestResult = mutation.mutate(latestConfiguration);

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(
        campaign(latestConfiguration),
      );
    });
    expect(campaignsIpc.setGenerationConfigurationOverride).toHaveBeenCalledTimes(1);

    firstSave.resolve(firstSaved);
    await expect(firstResult).resolves.toEqual(firstSaved);
    await vi.waitFor(() => {
      expect(campaignsIpc.setGenerationConfigurationOverride).toHaveBeenCalledTimes(2);
    });
    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(
      campaign(latestConfiguration),
    );

    latestSave.resolve(latestSaved);
    await expect(latestResult).resolves.toEqual(latestSaved);
    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(latestSaved);
    expect(
      queryClient.getQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey),
    ).toEqual([latestSaved]);
  });

  it("restores the original campaign when every ordered save fails", async () => {
    const queryClient = createQueryClient();
    const original = campaign(generationConfiguration("original", ReasoningPreset.Medium));
    const firstSave = deferred<Campaign>();
    const latestSave = deferred<Campaign>();
    const firstFailure = new Error("Could not save the first configuration.");
    const latestFailure = new Error("Could not save the latest configuration.");
    campaignsIpc.setGenerationConfigurationOverride
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(latestSave.promise);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    queryClient.setQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey, [original]);
    const mutation = observeConfigurationMutation(queryClient, original.id);

    const firstResult = mutation.mutate(generationConfiguration("first", ReasoningPreset.On));
    const latestResult = mutation.mutate(generationConfiguration("latest", ReasoningPreset.Off));
    const firstRejection = expect(firstResult).rejects.toBe(firstFailure);
    const latestRejection = expect(latestResult).rejects.toBe(latestFailure);

    firstSave.reject(firstFailure);
    await firstRejection;
    await vi.waitFor(() => {
      expect(campaignsIpc.setGenerationConfigurationOverride).toHaveBeenCalledTimes(2);
    });
    latestSave.reject(latestFailure);
    await latestRejection;

    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(original);
    expect(
      queryClient.getQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey),
    ).toEqual([original]);
  });

  it("restores the last confirmed campaign when the latest ordered save fails", async () => {
    const queryClient = createQueryClient();
    const original = campaign();
    const firstConfiguration = generationConfiguration("first", ReasoningPreset.On);
    const firstSaved = campaign(firstConfiguration);
    const firstSave = deferred<Campaign>();
    const latestSave = deferred<Campaign>();
    const latestFailure = new Error("Could not save the latest configuration.");
    campaignsIpc.setGenerationConfigurationOverride
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(latestSave.promise);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    queryClient.setQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey, [original]);
    const mutation = observeConfigurationMutation(queryClient, original.id);

    const firstResult = mutation.mutate(firstConfiguration);
    const latestResult = mutation.mutate(generationConfiguration("latest", ReasoningPreset.Off));
    const latestRejection = expect(latestResult).rejects.toBe(latestFailure);

    firstSave.resolve(firstSaved);
    await expect(firstResult).resolves.toEqual(firstSaved);
    await vi.waitFor(() => {
      expect(campaignsIpc.setGenerationConfigurationOverride).toHaveBeenCalledTimes(2);
    });
    latestSave.reject(latestFailure);
    await latestRejection;

    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(firstSaved);
    expect(
      queryClient.getQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey),
    ).toEqual([firstSaved]);
  });

  it("restores the previous campaign when saving fails", async () => {
    const queryClient = createQueryClient();
    const original = campaign(generationConfiguration("original", ReasoningPreset.Medium));
    const failure = new Error("Could not save the campaign model.");
    campaignsIpc.setGenerationConfigurationOverride.mockRejectedValue(failure);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    queryClient.setQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey, [original]);
    const mutation = observeConfigurationMutation(queryClient, original.id);

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
    const mutation = observeConfigurationMutation(queryClient, "missing-campaign");

    await expect(mutation.mutate(generationConfiguration("requested"))).rejects.toThrow(
      'Campaign "missing-campaign" is unavailable.',
    );
  });
});
