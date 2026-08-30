import type { Campaign, ModelSelection } from "@jaquelene/ipc/renderer";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const campaignsIpc = vi.hoisted(() => ({
  get: vi.fn(),
  listForScenario: vi.fn(),
  setModelOverride: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@jaquelene/ipc/renderer", () => ({ Campaigns: campaignsIpc }));

import {
  campaignQuery,
  campaignsForScenarioQuery,
  setCampaignModelOverrideMutationOptions,
} from "./query";

function modelSelection(id: string): ModelSelection {
  return {
    providerId: "provider-a",
    modelId: id,
    name: `Model ${id}`,
    brandId: "brand-a",
  };
}

function campaign(modelOverride?: ModelSelection): Campaign {
  return {
    id: "campaign-a",
    scenarioId: "scenario-a",
    threadId: "thread-a",
    startedAt: 100,
    ...(modelOverride ? { modelOverride } : {}),
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

describe("campaign model override mutation", () => {
  it("shows the override immediately and reconciles campaign caches", async () => {
    const queryClient = createQueryClient();
    const original = campaign();
    const requestedModel = modelSelection("requested");
    const saved = campaign({ ...requestedModel, name: "Saved model" });
    const save = deferred<Campaign>();
    campaignsIpc.setModelOverride.mockReturnValue(save.promise);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    queryClient.setQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey, [original]);
    const mutation = new MutationObserver(
      queryClient,
      setCampaignModelOverrideMutationOptions(queryClient, original.id),
    );

    const result = mutation.mutate(requestedModel);

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(
        campaign(requestedModel),
      );
    });

    save.resolve(saved);

    await expect(result).resolves.toEqual(saved);
    expect(campaignsIpc.setModelOverride).toHaveBeenCalledWith(original.id, requestedModel);
    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(saved);
    expect(
      queryClient.getQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey),
    ).toEqual([saved]);
  });

  it("returns a campaign to the global default immediately", async () => {
    const queryClient = createQueryClient();
    const original = campaign(modelSelection("override"));
    const inherited = campaign();
    const save = deferred<Campaign>();
    campaignsIpc.setModelOverride.mockReturnValue(save.promise);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    const mutation = new MutationObserver(
      queryClient,
      setCampaignModelOverrideMutationOptions(queryClient, original.id),
    );

    const result = mutation.mutate(null);

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(inherited);
    });

    save.resolve(inherited);
    await expect(result).resolves.toEqual(inherited);
    expect(campaignsIpc.setModelOverride).toHaveBeenCalledWith(original.id, null);
  });

  it("restores the previous campaign when saving fails", async () => {
    const queryClient = createQueryClient();
    const original = campaign(modelSelection("original"));
    const failure = new Error("Could not save the campaign model.");
    campaignsIpc.setModelOverride.mockRejectedValue(failure);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    queryClient.setQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey, [original]);
    const mutation = new MutationObserver(
      queryClient,
      setCampaignModelOverrideMutationOptions(queryClient, original.id),
    );

    await expect(mutation.mutate(modelSelection("requested"))).rejects.toBe(failure);

    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(original);
    expect(
      queryClient.getQueryData(campaignsForScenarioQuery(original.scenarioId).queryKey),
    ).toEqual([original]);
  });

  it("rejects an update when the campaign disappeared", async () => {
    const queryClient = createQueryClient();
    campaignsIpc.setModelOverride.mockResolvedValue(null);
    const mutation = new MutationObserver(
      queryClient,
      setCampaignModelOverrideMutationOptions(queryClient, "missing-campaign"),
    );

    await expect(mutation.mutate(modelSelection("requested"))).rejects.toThrow(
      'Campaign "missing-campaign" is unavailable.',
    );
  });
});
