import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";
import { campaignQueryKey } from "@/feature/cache-keys";
import {
  clearSubmittedCampaignSetupDraft,
  readCampaignSetupDraft,
  subscribeToCampaignSetupDraft,
  writeCampaignSetupDraft,
} from "./setup-draft";

describe("campaign setup drafts", () => {
  it("retains all fields without a mounted form and ends with the app session", () => {
    const client = new QueryClient();
    const unsubscribe = subscribeToCampaignSetupDraft(client, () => {});
    const values = { title: "Neon nights", scenario: "New York, 2026. Cyberpunk." };
    writeCampaignSetupDraft(client, { values });
    const draft = writeCampaignSetupDraft(client, { narratorPromptKey: "narrator-a" });
    unsubscribe();
    expect(readCampaignSetupDraft(client)).toEqual({ values, narratorPromptKey: "narrator-a" });
    expect(readCampaignSetupDraft(client)).toBe(draft);
    client.clear();
    expect(readCampaignSetupDraft(client)).toEqual({ values: { title: "", scenario: "" } });
  });

  it("notifies synchronously for edits and clearing, but ignores unrelated queries", () => {
    const client = new QueryClient();
    const changed = vi.fn();
    const unsubscribe = subscribeToCampaignSetupDraft(client, changed);
    client.setQueryData(["unrelated"], "other state");
    expect(changed).not.toHaveBeenCalled();
    const draft = writeCampaignSetupDraft(client, { values: { title: "A", scenario: "" } });
    expect(changed).toHaveBeenCalled();
    changed.mockClear();
    expect(writeCampaignSetupDraft(client, { values: { title: "A", scenario: "" } })).toBe(draft);
    expect(changed).not.toHaveBeenCalled();
    clearSubmittedCampaignSetupDraft(client, draft);
    expect(changed).toHaveBeenCalled();
    expect(readCampaignSetupDraft(client).values.title).toBe("");
    unsubscribe();
    client.clear();
  });

  it("preserves a newer draft when an earlier campaign finishes creating", () => {
    const client = new QueryClient();
    const submitted = writeCampaignSetupDraft(client, {
      values: { title: "First", scenario: "Moon" },
    });
    const next = writeCampaignSetupDraft(client, { values: { title: "Next", scenario: "" } });
    clearSubmittedCampaignSetupDraft(client, submitted);
    expect(readCampaignSetupDraft(client)).toBe(next);
    client.clear();
  });

  it("does not refetch or garbage-collect an inactive session draft", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { queryFn: fetch, gcTime: 1 } } });
    try {
      const draft = writeCampaignSetupDraft(client, {
        values: { title: "", scenario: "Unfinished" },
      });
      await client.invalidateQueries({ queryKey: campaignQueryKey, refetchType: "all" });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetch).not.toHaveBeenCalled();
      expect(readCampaignSetupDraft(client)).toBe(draft);
    } finally {
      client.clear();
      vi.useRealTimers();
    }
  });
});
