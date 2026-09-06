import type { ModelSelection } from "@jaquelene/ipc/renderer";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const preferences = vi.hoisted(() => ({ getDefaultModel: vi.fn(), setDefaultModel: vi.fn() }));
vi.mock("@jaquelene/ipc/renderer", () => ({ RegenerationPreferences: preferences }));
import {
  defaultRegenerationModelQuery,
  setDefaultRegenerationModelMutationOptions,
} from "./regeneration-preferences";

const previousModel: ModelSelection = {
  providerId: "provider-a",
  modelId: "model-a",
  name: "Model A",
  brandId: "brand-a",
};
const nextModel: ModelSelection = {
  providerId: "provider-b",
  modelId: "model-b",
  name: "Model B",
  brandId: "brand-b",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("default regeneration model mutation", () => {
  it("shows and persists the selection without changing campaign preferences", async () => {
    const selection = nextModel;
    const client = new QueryClient();
    const save = Promise.withResolvers<ModelSelection>();
    preferences.setDefaultModel.mockReturnValue(save.promise);
    client.setQueryData(defaultRegenerationModelQuery.queryKey, previousModel);
    const campaignKey = ["preferences", "campaign", "default-model"];
    client.setQueryData(campaignKey, previousModel);
    const mutation = new MutationObserver(
      client,
      setDefaultRegenerationModelMutationOptions(client),
    );
    const pending = mutation.mutate(selection);
    await vi.waitFor(() =>
      expect(client.getQueryData(defaultRegenerationModelQuery.queryKey)).toEqual(selection),
    );
    save.resolve(selection);
    await expect(pending).resolves.toEqual(selection);
    expect(preferences.setDefaultModel).toHaveBeenCalledWith(selection);
    expect(client.getQueryData(campaignKey)).toEqual(previousModel);
    client.clear();
  });

  it.each([previousModel, null, undefined])(
    "restores previous value %j after a failed save",
    async (previous) => {
      const client = new QueryClient();
      if (previous !== undefined) {
        client.setQueryData(defaultRegenerationModelQuery.queryKey, previous);
      }
      const error = new Error("Could not save.");
      preferences.setDefaultModel.mockRejectedValue(error);
      const mutation = new MutationObserver(
        client,
        setDefaultRegenerationModelMutationOptions(client),
      );
      await expect(mutation.mutate(nextModel)).rejects.toBe(error);
      expect(client.getQueryData(defaultRegenerationModelQuery.queryKey)).toEqual(previous);
      client.clear();
    },
  );
});
