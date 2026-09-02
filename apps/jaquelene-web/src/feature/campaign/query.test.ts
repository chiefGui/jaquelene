import { ReasoningPreset } from "@jaquelene/ipc/renderer";
import type {
  Campaign,
  CampaignGenerationPreferences,
  ModelSelection,
} from "@jaquelene/ipc/renderer";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const campaignsIpc = vi.hoisted(() => ({
  get: vi.fn(),
  listForScenario: vi.fn(),
  setGenerationPreferences: vi.fn(),
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
  setCampaignGenerationPreferencesMutationOptions,
} from "./query";

function modelSelection(id: string): ModelSelection {
  return {
    providerId: "provider-a",
    modelId: id,
    name: `Model ${id}`,
    brandId: "brand-a",
  };
}

function generationPreferences(
  id: string,
  reasoningPreset?: ReasoningPreset,
): CampaignGenerationPreferences {
  return {
    model: modelSelection(id),
    ...(reasoningPreset === undefined ? {} : { reasoningPreset }),
  };
}

function campaign(generationPreferences?: CampaignGenerationPreferences): Campaign {
  return {
    id: "campaign-a",
    scenarioId: "scenario-a",
    threadId: "thread-a",
    startedAt: 100,
    ...(generationPreferences ? { generationPreferences } : {}),
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

function observePreferencesMutation(queryClient: QueryClient, id: string) {
  return new MutationObserver(
    queryClient,
    setCampaignGenerationPreferencesMutationOptions(queryClient, id),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("campaign generation preferences mutation", () => {
  it("shows the preferences immediately and reconciles campaign caches", async () => {
    const queryClient = createQueryClient();
    const original = campaign();
    const requestedPreferences = generationPreferences("requested", ReasoningPreset.High);
    const saved = campaign({
      ...requestedPreferences,
      model: { ...modelSelection("requested"), name: "Saved model" },
    });
    const save = deferred<Campaign>();
    campaignsIpc.setGenerationPreferences.mockReturnValue(save.promise);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    queryClient.setQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey, [original]);
    const mutation = observePreferencesMutation(queryClient, original.id);

    const result = mutation.mutate(requestedPreferences);

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(
        campaign(requestedPreferences),
      );
    });

    save.resolve(saved);

    await expect(result).resolves.toEqual(saved);
    expect(campaignsIpc.setGenerationPreferences).toHaveBeenCalledWith(
      original.id,
      requestedPreferences,
    );
    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(saved);
    expect(
      queryClient.getQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey),
    ).toEqual([saved]);
  });

  it("stores a reasoning preference without pinning the inherited model", async () => {
    const queryClient = createQueryClient();
    const original = campaign();
    const requestedPreferences = { reasoningPreset: ReasoningPreset.High };
    const saved = campaign(requestedPreferences);
    campaignsIpc.setGenerationPreferences.mockResolvedValue(saved);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    const mutation = observePreferencesMutation(queryClient, original.id);

    await expect(mutation.mutate(requestedPreferences)).resolves.toEqual(saved);

    expect(campaignsIpc.setGenerationPreferences).toHaveBeenCalledWith(
      original.id,
      requestedPreferences,
    );
    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(saved);
  });

  it("returns a campaign to the global default immediately", async () => {
    const queryClient = createQueryClient();
    const original = campaign(generationPreferences("selected", ReasoningPreset.Low));
    const inherited = campaign();
    const save = deferred<Campaign>();
    campaignsIpc.setGenerationPreferences.mockReturnValue(save.promise);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    const mutation = observePreferencesMutation(queryClient, original.id);

    const result = mutation.mutate(null);

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(inherited);
    });

    save.resolve(inherited);
    await expect(result).resolves.toEqual(inherited);
    expect(campaignsIpc.setGenerationPreferences).toHaveBeenCalledWith(original.id, null);
  });

  it("keeps the latest optimistic configuration while ordered saves settle", async () => {
    const queryClient = createQueryClient();
    const original = campaign();
    const firstPreferences = generationPreferences("first", ReasoningPreset.On);
    const latestPreferences = generationPreferences("latest", ReasoningPreset.Off);
    const firstSaved = campaign(firstPreferences);
    const latestSaved = campaign(latestPreferences);
    const firstSave = deferred<Campaign>();
    const latestSave = deferred<Campaign>();
    campaignsIpc.setGenerationPreferences
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(latestSave.promise);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    queryClient.setQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey, [original]);
    const mutation = observePreferencesMutation(queryClient, original.id);

    const firstResult = mutation.mutate(firstPreferences);
    const latestResult = mutation.mutate(latestPreferences);

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(
        campaign(latestPreferences),
      );
    });
    expect(campaignsIpc.setGenerationPreferences).toHaveBeenCalledTimes(1);

    firstSave.resolve(firstSaved);
    await expect(firstResult).resolves.toEqual(firstSaved);
    await vi.waitFor(() => {
      expect(campaignsIpc.setGenerationPreferences).toHaveBeenCalledTimes(2);
    });
    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(
      campaign(latestPreferences),
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
    const original = campaign(generationPreferences("original", ReasoningPreset.Medium));
    const firstSave = deferred<Campaign>();
    const latestSave = deferred<Campaign>();
    const firstFailure = new Error("Could not save the first configuration.");
    const latestFailure = new Error("Could not save the latest configuration.");
    campaignsIpc.setGenerationPreferences
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(latestSave.promise);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    queryClient.setQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey, [original]);
    const mutation = observePreferencesMutation(queryClient, original.id);

    const firstResult = mutation.mutate(generationPreferences("first", ReasoningPreset.On));
    const latestResult = mutation.mutate(generationPreferences("latest", ReasoningPreset.Off));
    const firstRejection = expect(firstResult).rejects.toBe(firstFailure);
    const latestRejection = expect(latestResult).rejects.toBe(latestFailure);

    firstSave.reject(firstFailure);
    await firstRejection;
    await vi.waitFor(() => {
      expect(campaignsIpc.setGenerationPreferences).toHaveBeenCalledTimes(2);
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
    const firstPreferences = generationPreferences("first", ReasoningPreset.On);
    const firstSaved = campaign(firstPreferences);
    const firstSave = deferred<Campaign>();
    const latestSave = deferred<Campaign>();
    const latestFailure = new Error("Could not save the latest configuration.");
    campaignsIpc.setGenerationPreferences
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(latestSave.promise);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    queryClient.setQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey, [original]);
    const mutation = observePreferencesMutation(queryClient, original.id);

    const firstResult = mutation.mutate(firstPreferences);
    const latestResult = mutation.mutate(generationPreferences("latest", ReasoningPreset.Off));
    const latestRejection = expect(latestResult).rejects.toBe(latestFailure);

    firstSave.resolve(firstSaved);
    await expect(firstResult).resolves.toEqual(firstSaved);
    await vi.waitFor(() => {
      expect(campaignsIpc.setGenerationPreferences).toHaveBeenCalledTimes(2);
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
    const original = campaign(generationPreferences("original", ReasoningPreset.Medium));
    const failure = new Error("Could not save the campaign model.");
    campaignsIpc.setGenerationPreferences.mockRejectedValue(failure);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    queryClient.setQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey, [original]);
    const mutation = observePreferencesMutation(queryClient, original.id);

    await expect(
      mutation.mutate(generationPreferences("requested", ReasoningPreset.Minimal)),
    ).rejects.toBe(failure);

    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(original);
    expect(
      queryClient.getQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey),
    ).toEqual([original]);
  });

  it("rejects an update when the campaign disappeared", async () => {
    const queryClient = createQueryClient();
    campaignsIpc.setGenerationPreferences.mockResolvedValue(null);
    const mutation = observePreferencesMutation(queryClient, "missing-campaign");

    await expect(mutation.mutate(generationPreferences("requested"))).rejects.toThrow(
      'Campaign "missing-campaign" is unavailable.',
    );
  });
});
