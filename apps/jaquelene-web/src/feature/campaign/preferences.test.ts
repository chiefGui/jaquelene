import type { ModelSelection } from "@jaquelene/ipc/renderer";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const campaignPreferences = vi.hoisted(() => ({
  getDefaultModel: vi.fn(),
  setDefaultModel: vi.fn(),
}));

vi.mock("@jaquelene/ipc/renderer", () => ({ CampaignPreferences: campaignPreferences }));

import { defaultCampaignModelQuery, setDefaultCampaignModelMutationOptions } from "./preferences";

function modelSelection(id: string): ModelSelection {
  return {
    providerId: "provider-a",
    modelId: id,
    brandId: "brand-a",
    name: `Model ${id}`,
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

describe("default campaign model mutation", () => {
  it("shows the requested model immediately and commits the saved value", async () => {
    const queryClient = createQueryClient();
    const previousModel = modelSelection("previous");
    const requestedModel = modelSelection("requested");
    const savedModel = { ...requestedModel, name: "Saved model" };
    const save = deferred<ModelSelection>();
    campaignPreferences.setDefaultModel.mockReturnValue(save.promise);
    queryClient.setQueryData(defaultCampaignModelQuery.queryKey, previousModel);
    const mutation = new MutationObserver(
      queryClient,
      setDefaultCampaignModelMutationOptions(queryClient),
    );

    const result = mutation.mutate(requestedModel);

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(defaultCampaignModelQuery.queryKey)).toEqual(requestedModel);
    });

    save.resolve(savedModel);

    await expect(result).resolves.toEqual(savedModel);
    expect(queryClient.getQueryData(defaultCampaignModelQuery.queryKey)).toEqual(savedModel);
    expect(campaignPreferences.getDefaultModel).not.toHaveBeenCalled();
  });

  it.each([
    ["an existing model", modelSelection("previous")],
    ["no default model", null],
  ])("restores %s when saving fails", async (_case, previousModel) => {
    const queryClient = createQueryClient();
    const requestedModel = modelSelection("requested");
    const failure = new Error("Could not persist the default model.");
    campaignPreferences.setDefaultModel.mockRejectedValue(failure);
    queryClient.setQueryData(defaultCampaignModelQuery.queryKey, previousModel);
    const mutation = new MutationObserver(
      queryClient,
      setDefaultCampaignModelMutationOptions(queryClient),
    );

    await expect(mutation.mutate(requestedModel)).rejects.toBe(failure);

    expect(queryClient.getQueryData(defaultCampaignModelQuery.queryKey)).toEqual(previousModel);
    expect(mutation.getCurrentResult().error).toBe(failure);
    expect(campaignPreferences.getDefaultModel).not.toHaveBeenCalled();
  });

  it("removes an optimistic value when no prior cache entry existed", async () => {
    const queryClient = createQueryClient();
    const failure = new Error("Could not persist the default model.");
    campaignPreferences.setDefaultModel.mockRejectedValue(failure);
    const mutation = new MutationObserver(
      queryClient,
      setDefaultCampaignModelMutationOptions(queryClient),
    );

    await expect(mutation.mutate(modelSelection("requested"))).rejects.toBe(failure);

    expect(queryClient.getQueryState(defaultCampaignModelQuery.queryKey)).toBeUndefined();
  });
});
