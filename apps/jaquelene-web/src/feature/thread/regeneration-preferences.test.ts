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
  it.each([nextModel, null])(
    "shows and persists selection %j without changing campaign preferences",
    async (selection) => {
      const client = new QueryClient();
      const save = Promise.withResolvers<ModelSelection | null>();
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
    },
  );

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

  it("restores the model when clearing its default fails", async () => {
    const client = new QueryClient();
    client.setQueryData(defaultRegenerationModelQuery.queryKey, previousModel);
    preferences.setDefaultModel.mockRejectedValue(new Error("Could not clear."));
    const mutation = new MutationObserver(
      client,
      setDefaultRegenerationModelMutationOptions(client),
    );
    await expect(mutation.mutate(null)).rejects.toThrow("Could not clear.");
    expect(client.getQueryData(defaultRegenerationModelQuery.queryKey)).toEqual(previousModel);
    client.clear();
  });
});
