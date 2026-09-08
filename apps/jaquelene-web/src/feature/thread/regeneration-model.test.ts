import type { ModelSelection } from "@jaquelene/ipc/renderer";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";
import { campaignQueryKey, threadQueryKey } from "@/feature/cache-keys";
import {
  readSessionRegenerationModel,
  rememberRegenerationModel,
  resolveRegenerationModel,
  subscribeToSessionRegenerationModel,
} from "./regeneration-model";

const modelA: ModelSelection = {
  providerId: "provider-a",
  modelId: "model-a",
  name: "Model A",
  brandId: "brand-a",
};
const modelB: ModelSelection = { ...modelA, modelId: "model-b", name: "Model B" };
const modelC: ModelSelection = { ...modelA, providerId: "provider-c", name: "Model C" };

function openChoice(client: QueryClient, defaultModel: ModelSelection | null, pending = false) {
  return resolveRegenerationModel(
    readSessionRegenerationModel(client),
    defaultModel,
    pending,
    (model) => rememberRegenerationModel(client, model),
  );
}

describe("regeneration model choices", () => {
  it("starts empty and follows a newly saved default until an inline choice is made", () => {
    const client = new QueryClient();
    expect(openChoice(client, null).configuration).toBeNull();
    expect(openChoice(client, modelA, true).pending).toBe(true);
    expect(openChoice(client, modelA).configuration).toEqual({ model: modelA });
    expect(openChoice(client, modelA).pending).toBe(false);
    expect(readSessionRegenerationModel(client)).toBeNull();
    client.clear();
  });

  it("remembers the inline choice immediately without requiring a regeneration request", () => {
    const client = new QueryClient();
    const unsubscribe = subscribeToSessionRegenerationModel(client, () => {});
    const opening = openChoice(client, null);
    expect(opening.select(modelA)).toEqual({ model: modelA });
    expect(readSessionRegenerationModel(client)).toEqual(modelA);
    unsubscribe();

    // Closing the dialog or navigating away does not commit or discard this choice.
    const reopened = openChoice(client, null);
    expect(reopened.configuration).toEqual({ model: modelA });
    expect(reopened.select(modelB)).toEqual({ model: modelB });
    expect(openChoice(client, null).configuration).toEqual({ model: modelB });
    client.clear();
  });

  it.each([null, modelB, modelC])(
    "keeps the session choice usable with saved default %j, including while saving",
    (defaultModel) => {
      const client = new QueryClient();
      openChoice(client, null).select(modelA);
      const choice = openChoice(client, defaultModel, true);
      expect(choice.configuration).toEqual({ model: modelA });
      expect(choice.pending).toBe(false);
      choice.select(modelC);
      expect(openChoice(client, defaultModel).configuration).toEqual({ model: modelC });
      client.clear();
    },
  );

  it("keeps inline overrides of an existing default specific to the request", () => {
    const client = new QueryClient();
    const opening = openChoice(client, modelA);
    expect(opening.select(modelB)).toEqual({ model: modelB });
    expect(opening.select(modelC)).toEqual({ model: modelC });
    expect(readSessionRegenerationModel(client)).toBeNull();
    expect(openChoice(client, modelA).configuration).toEqual({ model: modelA });
    expect(openChoice(client, modelB).configuration).toEqual({ model: modelB });
    client.clear();
  });

  it("keeps an open request's model and selection policy when the default changes", () => {
    const client = new QueryClient();
    const emptyOpening = openChoice(client, null);
    const defaultOpening = openChoice(client, modelB);

    expect(emptyOpening.configuration).toBeNull();
    emptyOpening.select(modelA);
    expect(openChoice(client, modelB).configuration).toEqual({ model: modelA });

    expect(defaultOpening.configuration).toEqual({ model: modelB });
    expect(defaultOpening.select(modelC)).toEqual({ model: modelC });
    expect(readSessionRegenerationModel(client)).toEqual(modelA);
    client.clear();
  });

  it("uses the saved default again in a new session and isolates application instances", () => {
    const client = new QueryClient();
    const otherClient = new QueryClient();
    openChoice(client, null).select(modelA);
    expect(openChoice(otherClient, modelB).configuration).toEqual({ model: modelB });
    client.clear();
    expect(readSessionRegenerationModel(client)).toBeNull();
    expect(openChoice(client, modelB).configuration).toEqual({ model: modelB });
    expect(openChoice(client, null).configuration).toBeNull();
    otherClient.clear();
  });

  it("notifies synchronously for session changes and ignores unrelated data", () => {
    const client = new QueryClient();
    const changed = vi.fn();
    const unsubscribe = subscribeToSessionRegenerationModel(client, changed);
    client.setQueryData(campaignQueryKey, []);
    client.setQueryData(threadQueryKey, []);
    expect(changed).not.toHaveBeenCalled();

    rememberRegenerationModel(client, modelA);
    expect(changed).toHaveBeenCalled();
    const snapshot = readSessionRegenerationModel(client);
    expect(readSessionRegenerationModel(client)).toBe(snapshot);
    changed.mockClear();

    client.removeQueries({ queryKey: campaignQueryKey });
    client.removeQueries({ queryKey: threadQueryKey });
    expect(changed).not.toHaveBeenCalled();
    expect(readSessionRegenerationModel(client)).toBe(snapshot);
    client.clear();
    expect(changed).toHaveBeenCalled();
    expect(readSessionRegenerationModel(client)).toBeNull();
    unsubscribe();
  });

  it("does not fetch or expire the selection while no campaign is mounted", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { queryFn: fetch, gcTime: 1 } } });
    try {
      openChoice(client, null).select(modelA);
      await client.invalidateQueries({ refetchType: "all" });
      await vi.advanceTimersByTimeAsync(30 * 60_000);
      expect(fetch).not.toHaveBeenCalled();
      expect(openChoice(client, null).configuration).toEqual({ model: modelA });
    } finally {
      client.clear();
      vi.useRealTimers();
    }
  });
});
