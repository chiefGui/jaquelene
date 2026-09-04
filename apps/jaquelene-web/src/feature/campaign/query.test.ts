import { ReasoningPreset } from "@jaquelene/ipc/renderer";
import type {
  Campaign,
  CampaignPage,
  CampaignGenerationPreferences,
  CampaignSummary,
  ModelSelection,
} from "@jaquelene/ipc/renderer";
import { MutationObserver, QueryClient, type InfiniteData } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const campaignsIpc = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  rename: vi.fn(),
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
  campaignPagesQuery,
  campaignQuery,
  deleteCampaignMutationOptions,
  setCampaignGenerationPreferencesMutationOptions,
  startCampaignMutationOptions,
  updateCampaignActivity,
} from "./query";
import {
  campaignPromptSelectionPrefix,
  campaignUsageRecordQueryKey,
  threadQueryPrefix,
} from "@/feature/cache-keys";

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
    title: "Campaign A",
    threadId: "thread-a",
    startedAt: 100,
    lastActivityAt: 100,
    turnCount: 0,
    ...(generationPreferences ? { generationPreferences } : {}),
  };
}

function campaignSummary(value: Campaign): CampaignSummary {
  return {
    id: value.id,
    title: value.title,
    threadId: value.threadId,
    lastActivityAt: value.lastActivityAt,
  };
}

function cacheCampaignPage(queryClient: QueryClient, campaign: Campaign) {
  queryClient.setQueryData<InfiniteData<CampaignPage>>(campaignPagesQuery.queryKey, {
    pages: [{ campaigns: [campaignSummary(campaign)] }],
    pageParams: [undefined],
  });
}

function cachedCampaignPage(queryClient: QueryClient) {
  return queryClient.getQueryData<InfiniteData<CampaignPage>>(campaignPagesQuery.queryKey);
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

describe("campaign start mutation", () => {
  it("publishes a started campaign immediately and schedules list reconciliation", async () => {
    const queryClient = createQueryClient();
    const existing = campaign();
    const started: Campaign = {
      id: "campaign-new",
      title: "New campaign",
      threadId: "thread-new",
      startedAt: 200,
      lastActivityAt: 200,
      turnCount: 0,
    };
    const request = { title: started.title, composition: [] };
    campaignsIpc.start.mockResolvedValue(started);
    cacheCampaignPage(queryClient, existing);
    const mutation = new MutationObserver(queryClient, startCampaignMutationOptions(queryClient));

    await expect(mutation.mutate(request)).resolves.toEqual(started);

    expect(queryClient.getQueryData(campaignQuery(started.id).queryKey)).toEqual(started);
    expect(cachedCampaignPage(queryClient)?.pages[0]?.campaigns).toEqual([
      campaignSummary(started),
      campaignSummary(existing),
    ]);
    expect(queryClient.getQueryState(campaignPagesQuery.queryKey)?.isInvalidated).toBe(true);
    expect(campaignsIpc.list).not.toHaveBeenCalled();
  });

  it("keeps the loaded campaign window bounded while reconciliation is pending", async () => {
    const queryClient = createQueryClient();
    const summaries: CampaignSummary[] = [400, 300, 200, 100].map((lastActivityAt) => ({
      id: `campaign-${lastActivityAt}`,
      title: `Campaign ${lastActivityAt}`,
      threadId: `thread-${lastActivityAt}`,
      lastActivityAt,
    }));
    const started: Campaign = {
      id: "campaign-new",
      title: "New campaign",
      threadId: "thread-new",
      startedAt: 500,
      lastActivityAt: 500,
      turnCount: 0,
    };
    campaignsIpc.start.mockResolvedValue(started);
    queryClient.setQueryData<InfiniteData<CampaignPage>>(campaignPagesQuery.queryKey, {
      pages: [
        { campaigns: summaries.slice(0, 2), nextCursor: "second-page" },
        { campaigns: summaries.slice(2), nextCursor: "more-campaigns" },
      ],
      pageParams: [undefined, "second-page"],
    });
    const mutation = new MutationObserver(queryClient, startCampaignMutationOptions(queryClient));

    await mutation.mutate({ title: started.title, composition: [] });

    expect(cachedCampaignPage(queryClient)?.pages.map((page) => page.campaigns)).toEqual([
      [campaignSummary(started), summaries[0]],
      [summaries[1], summaries[2]],
    ]);
    expect(queryClient.getQueryState(campaignPagesQuery.queryKey)?.isInvalidated).toBe(true);
  });
});

describe("campaign deletion mutation", () => {
  it("removes campaign-owned caches and reconciles the campaign list", async () => {
    const queryClient = createQueryClient();
    const deleted = campaign();
    const retained: CampaignSummary = {
      id: "campaign-b",
      title: "Campaign B",
      threadId: "thread-b",
      lastActivityAt: 90,
    };
    campaignsIpc.delete.mockResolvedValue({ id: deleted.id, threadId: deleted.threadId });
    queryClient.setQueryData(campaignQuery(deleted.id).queryKey, deleted);
    queryClient.setQueryData<InfiniteData<CampaignPage>>(campaignPagesQuery.queryKey, {
      pages: [
        { campaigns: [campaignSummary(deleted), retained] },
        { campaigns: [campaignSummary(deleted)] },
      ],
      pageParams: [undefined, "next-page"],
    });
    queryClient.setQueryData(campaignUsageRecordQueryKey(deleted.id), { attempts: 1 });
    queryClient.setQueryData([...threadQueryPrefix(deleted.threadId), "messages"], {
      pages: [],
    });
    queryClient.setQueryData([...campaignPromptSelectionPrefix(deleted.id), "test"], {
      promptKey: "prompt-a",
    });
    const mutation = new MutationObserver(
      queryClient,
      deleteCampaignMutationOptions(queryClient, deleted),
    );

    await expect(mutation.mutate()).resolves.toEqual({
      id: deleted.id,
      threadId: deleted.threadId,
    });

    expect(campaignsIpc.delete).toHaveBeenCalledWith(deleted.id);
    expect(queryClient.getQueryData(campaignQuery(deleted.id).queryKey)).toBeNull();
    expect(cachedCampaignPage(queryClient)?.pages.map((page) => page.campaigns)).toEqual([
      [retained],
      [],
    ]);
    expect(queryClient.getQueryData(campaignUsageRecordQueryKey(deleted.id))).toBeNull();
    expect(queryClient.getQueriesData({ queryKey: threadQueryPrefix(deleted.threadId) })).toEqual(
      [],
    );
    expect(
      queryClient.getQueriesData({ queryKey: campaignPromptSelectionPrefix(deleted.id) }),
    ).toEqual([]);
    expect(queryClient.getQueryState(campaignPagesQuery.queryKey)?.isInvalidated).toBe(true);
  });

  it("waits for an earlier campaign save before deleting without restoring stale data", async () => {
    const queryClient = createQueryClient();
    const original = campaign();
    const saved = campaign(generationPreferences("saved"));
    const save = deferred<Campaign>();
    campaignsIpc.setGenerationPreferences.mockReturnValue(save.promise);
    campaignsIpc.delete.mockResolvedValue({ id: original.id, threadId: original.threadId });
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    cacheCampaignPage(queryClient, original);
    const saveMutation = observePreferencesMutation(queryClient, original.id);
    const deleteMutation = new MutationObserver(
      queryClient,
      deleteCampaignMutationOptions(queryClient, original),
    );

    const saving = saveMutation.mutate(generationPreferences("saved"));
    const deleting = deleteMutation.mutate();
    await vi.waitFor(() => expect(campaignsIpc.setGenerationPreferences).toHaveBeenCalledOnce());
    expect(campaignsIpc.delete).not.toHaveBeenCalled();

    save.resolve(saved);
    await expect(saving).resolves.toEqual(saved);
    await expect(deleting).resolves.toEqual({ id: original.id, threadId: original.threadId });
    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toBeNull();
    expect(cachedCampaignPage(queryClient)?.pages[0]?.campaigns).toEqual([]);
  });

  it("preserves cached campaign state when deletion fails", async () => {
    const queryClient = createQueryClient();
    const retained = campaign();
    const usage = { attempts: 1 };
    const failure = new Error("Could not delete the campaign.");
    campaignsIpc.delete.mockRejectedValue(failure);
    queryClient.setQueryData(campaignQuery(retained.id).queryKey, retained);
    cacheCampaignPage(queryClient, retained);
    queryClient.setQueryData(campaignUsageRecordQueryKey(retained.id), usage);
    const mutation = new MutationObserver(
      queryClient,
      deleteCampaignMutationOptions(queryClient, retained),
    );

    await expect(mutation.mutate()).rejects.toBe(failure);

    expect(queryClient.getQueryData(campaignQuery(retained.id).queryKey)).toEqual(retained);
    expect(cachedCampaignPage(queryClient)?.pages[0]?.campaigns).toEqual([
      campaignSummary(retained),
    ]);
    expect(queryClient.getQueryData(campaignUsageRecordQueryKey(retained.id))).toEqual(usage);
    expect(queryClient.getQueryState(campaignPagesQuery.queryKey)?.isInvalidated).toBe(false);
  });
});

describe("campaign generation preferences mutation", () => {
  it("shows the preferences immediately and reconciles campaign caches", async () => {
    const queryClient = createQueryClient();
    const original = { ...campaign(), lastActivityAt: 500, turnCount: 4 };
    const requestedPreferences = generationPreferences("requested", ReasoningPreset.High);
    const saved = campaign({
      ...requestedPreferences,
      model: { ...modelSelection("requested"), name: "Saved model" },
    });
    const save = deferred<Campaign>();
    campaignsIpc.setGenerationPreferences.mockReturnValue(save.promise);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    cacheCampaignPage(queryClient, original);
    const mutation = observePreferencesMutation(queryClient, original.id);

    const result = mutation.mutate(requestedPreferences);

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual({
        ...campaign(requestedPreferences),
        lastActivityAt: 500,
        turnCount: 4,
      });
    });

    save.resolve(saved);

    await expect(result).resolves.toEqual(saved);
    expect(campaignsIpc.setGenerationPreferences).toHaveBeenCalledWith(
      original.id,
      requestedPreferences,
    );
    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual({
      ...saved,
      lastActivityAt: 500,
      turnCount: 4,
    });
    expect(cachedCampaignPage(queryClient)?.pages[0]?.campaigns).toEqual([
      campaignSummary(original),
    ]);
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
    cacheCampaignPage(queryClient, original);
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
    expect(cachedCampaignPage(queryClient)?.pages[0]?.campaigns).toEqual([
      campaignSummary(original),
    ]);
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
    cacheCampaignPage(queryClient, original);
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
    expect(cachedCampaignPage(queryClient)?.pages[0]?.campaigns).toEqual([
      campaignSummary(original),
    ]);
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
    cacheCampaignPage(queryClient, original);
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
    expect(cachedCampaignPage(queryClient)?.pages[0]?.campaigns).toEqual([
      campaignSummary(original),
    ]);
  });

  it("restores the previous campaign when saving fails", async () => {
    const queryClient = createQueryClient();
    const original = campaign(generationPreferences("original", ReasoningPreset.Medium));
    const failure = new Error("Could not save the campaign model.");
    campaignsIpc.setGenerationPreferences.mockRejectedValue(failure);
    queryClient.setQueryData(campaignQuery(original.id).queryKey, original);
    cacheCampaignPage(queryClient, original);
    const mutation = observePreferencesMutation(queryClient, original.id);

    await expect(
      mutation.mutate(generationPreferences("requested", ReasoningPreset.Minimal)),
    ).rejects.toBe(failure);

    expect(queryClient.getQueryData(campaignQuery(original.id).queryKey)).toEqual(original);
    expect(cachedCampaignPage(queryClient)?.pages[0]?.campaigns).toEqual([
      campaignSummary(original),
    ]);
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

describe("campaign activity cache", () => {
  it("reorders loaded pages and updates campaign details immediately", () => {
    const queryClient = createQueryClient();
    const older = campaignSummary(campaign());
    const newer: CampaignSummary = {
      id: "campaign-b",
      title: "Campaign B",
      threadId: "thread-b",
      lastActivityAt: 200,
    };
    queryClient.setQueryData<InfiniteData<CampaignPage>>(campaignPagesQuery.queryKey, {
      pages: [{ campaigns: [newer] }, { campaigns: [older] }],
      pageParams: [undefined, "next-page"],
    });
    queryClient.setQueryData(campaignQuery(older.id).queryKey, campaign());

    expect(
      updateCampaignActivity(queryClient, {
        threadId: older.threadId,
        lastActivityAt: 300,
        turnCount: 1,
      }),
    ).toBe(true);

    expect(cachedCampaignPage(queryClient)?.pages.map((page) => page.campaigns)).toEqual([
      [{ ...older, lastActivityAt: 300 }],
      [newer],
    ]);
    expect(queryClient.getQueryData(campaignQuery(older.id).queryKey)).toEqual({
      ...campaign(),
      lastActivityAt: 300,
      turnCount: 1,
    });
  });

  it("does not rewind activity when settlement arrives before submission acknowledgement", () => {
    const queryClient = createQueryClient();
    const cached = campaignSummary(campaign());
    queryClient.setQueryData<InfiniteData<CampaignPage>>(campaignPagesQuery.queryKey, {
      pages: [{ campaigns: [cached] }],
      pageParams: [undefined],
    });
    queryClient.setQueryData(campaignQuery(cached.id).queryKey, campaign());

    expect(
      updateCampaignActivity(queryClient, {
        threadId: cached.threadId,
        lastActivityAt: 300,
        turnCount: 2,
      }),
    ).toBe(false);
    expect(
      updateCampaignActivity(queryClient, {
        threadId: cached.threadId,
        lastActivityAt: 200,
        turnCount: 1,
      }),
    ).toBe(false);

    expect(cachedCampaignPage(queryClient)?.pages[0]?.campaigns).toEqual([
      { ...cached, lastActivityAt: 300 },
    ]);
    expect(queryClient.getQueryData(campaignQuery(cached.id).queryKey)).toEqual({
      ...campaign(),
      lastActivityAt: 300,
      turnCount: 2,
    });
  });

  it("applies authoritative activity when deletion moves a campaign down", () => {
    const queryClient = createQueryClient();
    const active: CampaignSummary = {
      ...campaignSummary(campaign()),
      lastActivityAt: 300,
    };
    const other: CampaignSummary = {
      id: "campaign-b",
      title: "Campaign B",
      threadId: "thread-b",
      lastActivityAt: 200,
    };
    const activeCampaign: Campaign = {
      ...campaign(),
      lastActivityAt: 300,
      turnCount: 5,
    };
    queryClient.setQueryData<InfiniteData<CampaignPage>>(campaignPagesQuery.queryKey, {
      pages: [{ campaigns: [active, other] }],
      pageParams: [undefined],
    });
    queryClient.setQueryData(campaignQuery(active.id).queryKey, activeCampaign);

    updateCampaignActivity(
      queryClient,
      {
        threadId: active.threadId,
        lastActivityAt: 100,
        turnCount: 1,
      },
      { allowRewind: true },
    );

    expect(cachedCampaignPage(queryClient)?.pages[0]?.campaigns).toEqual([
      other,
      { ...active, lastActivityAt: 100 },
    ]);
    expect(queryClient.getQueryData(campaignQuery(active.id).queryKey)).toEqual({
      ...campaign(),
      lastActivityAt: 100,
      turnCount: 1,
    });
  });
});
