import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";
import { campaignQueryKey } from "@/feature/cache-keys";
import {
  clearSubmittedCampaignSetupDraft,
  readCampaignSetupDraft,
  resolveCampaignSetupValues,
  subscribeToCampaignSetupDraft,
  writeCampaignSetupDraft,
} from "./setup-draft";

describe("campaign setup drafts", () => {
  it("follows edits, replacement, and removal of the default without storing its text", () => {
    const client = new QueryClient();
    const draft = readCampaignSetupDraft(client);
    expect(resolveCampaignSetupValues(draft, "").scenario).toBe("");
    expect(resolveCampaignSetupValues(draft, "New York, 1920.").scenario).toBe("New York, 1920.");
    expect(resolveCampaignSetupValues(draft, "New York, 1930.").scenario).toBe("New York, 1930.");
    expect(resolveCampaignSetupValues(draft, "Mars, 2200.").scenario).toBe("Mars, 2200.");
    expect(resolveCampaignSetupValues(draft, "").scenario).toBe("");
    expect(readCampaignSetupDraft(client)).toBe(draft);
    client.clear();
  });

  it("keeps following the default after title and narrator edits and navigation", () => {
    const client = new QueryClient();
    writeCampaignSetupDraft(client, { title: "My campaign" });
    writeCampaignSetupDraft(client, { narratorPromptKey: "narrator-a" });
    const draft = readCampaignSetupDraft(client);
    expect(draft.narratorPromptKey).toBe("narrator-a");
    expect(resolveCampaignSetupValues(draft, "Updated default")).toEqual({
      title: "My campaign",
      scenario: "Updated default",
      openingScene: "",
    });
    client.clear();
  });

  it.each(["", "Custom world", "Same text as the default"])(
    "preserves explicit custom text %j independently of the default",
    (text) => {
      const client = new QueryClient();
      const draft = writeCampaignSetupDraft(client, { scenario: { mode: "custom", text } });
      expect(resolveCampaignSetupValues(draft, "Same text as the default").scenario).toBe(text);
      expect(
        resolveCampaignSetupValues(readCampaignSetupDraft(client), "New default").scenario,
      ).toBe(text);
      expect(resolveCampaignSetupValues(draft, "").scenario).toBe(text);
      client.clear();
    },
  );

  it("resolves submission text as a snapshot and starts following again after success", () => {
    const client = new QueryClient();
    const draft = writeCampaignSetupDraft(client, { title: "New campaign" });
    const submitted = resolveCampaignSetupValues(draft, "Original default");
    expect(resolveCampaignSetupValues(draft, "Edited default").scenario).toBe("Edited default");
    expect(submitted.scenario).toBe("Original default");
    clearSubmittedCampaignSetupDraft(client, draft);
    expect(resolveCampaignSetupValues(readCampaignSetupDraft(client), "Latest default")).toEqual({
      title: "",
      scenario: "Latest default",
      openingScene: "",
    });
    client.clear();
  });

  it("retains all fields without a mounted form and ends with the app session", () => {
    const client = new QueryClient();
    const unsubscribe = subscribeToCampaignSetupDraft(client, () => {});
    const values = { title: "Neon nights", scenario: "New York, 2026. Cyberpunk." };
    writeCampaignSetupDraft(client, {
      title: values.title,
      scenario: { mode: "custom", text: values.scenario },
    });
    const draft = writeCampaignSetupDraft(client, { narratorPromptKey: "narrator-a" });
    unsubscribe();
    expect(readCampaignSetupDraft(client)).toEqual({
      title: values.title,
      scenario: { mode: "custom", text: values.scenario },
      narratorPromptKey: "narrator-a",
      openingScene: "",
    });
    expect(readCampaignSetupDraft(client)).toBe(draft);
    client.clear();
    expect(readCampaignSetupDraft(client)).toEqual({
      title: "",
      scenario: { mode: "default" },
      openingScene: "",
    });
  });

  it("retains the exact opening independently of scenario defaults and newer draft edits", () => {
    const client = new QueryClient();
    const openingScene = "  John wakes up.\n\nSomeone knocks.\n";
    const submitted = writeCampaignSetupDraft(client, { openingScene });
    expect(
      resolveCampaignSetupValues(readCampaignSetupDraft(client), "A new default").openingScene,
    ).toBe(openingScene);
    const next = writeCampaignSetupDraft(client, { openingScene: "A different opening." });
    clearSubmittedCampaignSetupDraft(client, submitted);
    expect(readCampaignSetupDraft(client)).toBe(next);
    clearSubmittedCampaignSetupDraft(client, next);
    expect(readCampaignSetupDraft(client).openingScene).toBe("");
    client.clear();
  });

  it("notifies synchronously for edits and clearing, but ignores unrelated queries", () => {
    const client = new QueryClient();
    const changed = vi.fn();
    const unsubscribe = subscribeToCampaignSetupDraft(client, changed);
    client.setQueryData(["unrelated"], "other state");
    expect(changed).not.toHaveBeenCalled();
    const draft = writeCampaignSetupDraft(client, {
      title: "A",
      scenario: { mode: "custom", text: "" },
    });
    expect(changed).toHaveBeenCalled();
    changed.mockClear();
    expect(
      writeCampaignSetupDraft(client, { title: "A", scenario: { mode: "custom", text: "" } }),
    ).toBe(draft);
    expect(changed).not.toHaveBeenCalled();
    clearSubmittedCampaignSetupDraft(client, draft);
    expect(changed).toHaveBeenCalled();
    expect(readCampaignSetupDraft(client).title).toBe("");
    unsubscribe();
    client.clear();
  });

  it("preserves a newer draft when an earlier campaign finishes creating", () => {
    const client = new QueryClient();
    const submitted = writeCampaignSetupDraft(client, {
      title: "First",
      scenario: { mode: "custom", text: "Moon" },
    });
    const next = writeCampaignSetupDraft(client, {
      title: "Next",
      scenario: { mode: "custom", text: "" },
    });
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
        scenario: { mode: "custom", text: "Unfinished" },
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
