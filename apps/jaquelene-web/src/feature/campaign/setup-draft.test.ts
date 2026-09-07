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
    expect(resolveCampaignSetupValues(draft, { scenario: "", openingScene: "" }).scenario).toBe("");
    expect(
      resolveCampaignSetupValues(draft, { scenario: "New York, 1920.", openingScene: "" }).scenario,
    ).toBe("New York, 1920.");
    expect(
      resolveCampaignSetupValues(draft, { scenario: "New York, 1930.", openingScene: "" }).scenario,
    ).toBe("New York, 1930.");
    expect(
      resolveCampaignSetupValues(draft, { scenario: "Mars, 2200.", openingScene: "" }).scenario,
    ).toBe("Mars, 2200.");
    expect(resolveCampaignSetupValues(draft, { scenario: "", openingScene: "" }).scenario).toBe("");
    expect(readCampaignSetupDraft(client)).toBe(draft);
    client.clear();
  });

  it("keeps following the default after title and narrator edits and navigation", () => {
    const client = new QueryClient();
    writeCampaignSetupDraft(client, { title: "My campaign" });
    writeCampaignSetupDraft(client, { narratorPromptKey: "narrator-a" });
    const draft = readCampaignSetupDraft(client);
    expect(draft.narratorPromptKey).toBe("narrator-a");
    expect(
      resolveCampaignSetupValues(draft, { scenario: "Updated default", openingScene: "" }),
    ).toEqual({
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
      expect(
        resolveCampaignSetupValues(draft, {
          scenario: "Same text as the default",
          openingScene: "",
        }).scenario,
      ).toBe(text);
      expect(
        resolveCampaignSetupValues(readCampaignSetupDraft(client), {
          scenario: "New default",
          openingScene: "",
        }).scenario,
      ).toBe(text);
      expect(resolveCampaignSetupValues(draft, { scenario: "", openingScene: "" }).scenario).toBe(
        text,
      );
      client.clear();
    },
  );

  it("resolves submission text as a snapshot and starts following again after success", () => {
    const client = new QueryClient();
    const draft = writeCampaignSetupDraft(client, { title: "New campaign" });
    const submitted = resolveCampaignSetupValues(draft, {
      scenario: "Original default",
      openingScene: "",
    });
    expect(
      resolveCampaignSetupValues(draft, { scenario: "Edited default", openingScene: "" }).scenario,
    ).toBe("Edited default");
    expect(submitted.scenario).toBe("Original default");
    clearSubmittedCampaignSetupDraft(client, draft);
    expect(
      resolveCampaignSetupValues(readCampaignSetupDraft(client), {
        scenario: "Latest default",
        openingScene: "",
      }),
    ).toEqual({
      title: "",
      scenario: "Latest default",
      openingScene: "",
    });
    client.clear();
  });

  it("follows opening defaults independently until the player edits or clears them", () => {
    const client = new QueryClient();
    const draft = writeCampaignSetupDraft(client, {
      title: "Morning",
      narratorPromptKey: "narrator-a",
    });
    const defaults = { scenario: "New York", openingScene: "Someone knocks." };
    expect(resolveCampaignSetupValues(draft, defaults)).toEqual({ title: "Morning", ...defaults });
    expect(
      resolveCampaignSetupValues(draft, { ...defaults, openingScene: "A phone rings." })
        .openingScene,
    ).toBe("A phone rings.");
    expect(resolveCampaignSetupValues(draft, { ...defaults, openingScene: "" }).openingScene).toBe(
      "",
    );
    const cleared = writeCampaignSetupDraft(client, { openingScene: { mode: "custom", text: "" } });
    expect(resolveCampaignSetupValues(cleared, defaults)).toEqual({
      title: "Morning",
      scenario: "New York",
      openingScene: "",
    });
    const imported = writeCampaignSetupDraft(client, {
      openingScene: { mode: "custom", text: "  A bell rings.\n" },
    });
    expect(resolveCampaignSetupValues(imported, defaults).openingScene).toBe("  A bell rings.\n");
    expect(
      resolveCampaignSetupValues(imported, { scenario: "Mars", openingScene: "" }).openingScene,
    ).toBe("  A bell rings.\n");
    client.clear();
  });

  it("snapshots the opening on submission and follows its default again after success", () => {
    const client = new QueryClient();
    const draft = readCampaignSetupDraft(client);
    const submitted = resolveCampaignSetupValues(draft, { scenario: "", openingScene: "Original" });
    expect(
      resolveCampaignSetupValues(draft, { scenario: "", openingScene: "Edited" }).openingScene,
    ).toBe("Edited");
    expect(submitted.openingScene).toBe("Original");
    clearSubmittedCampaignSetupDraft(client, draft);
    expect(
      resolveCampaignSetupValues(readCampaignSetupDraft(client), {
        scenario: "",
        openingScene: "Latest",
      }).openingScene,
    ).toBe("Latest");
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
      openingScene: { mode: "default" },
    });
    expect(readCampaignSetupDraft(client)).toBe(draft);
    client.clear();
    expect(readCampaignSetupDraft(client)).toEqual({
      title: "",
      scenario: { mode: "default" },
      openingScene: { mode: "default" },
    });
  });

  it("retains the exact opening independently of scenario defaults and newer draft edits", () => {
    const client = new QueryClient();
    const openingScene = "  John wakes up.\n\nSomeone knocks.\n";
    const submitted = writeCampaignSetupDraft(client, {
      openingScene: { mode: "custom", text: openingScene },
    });
    expect(
      resolveCampaignSetupValues(readCampaignSetupDraft(client), {
        scenario: "A new default",
        openingScene: "",
      }).openingScene,
    ).toBe(openingScene);
    const next = writeCampaignSetupDraft(client, {
      openingScene: { mode: "custom", text: "A different opening." },
    });
    clearSubmittedCampaignSetupDraft(client, submitted);
    expect(readCampaignSetupDraft(client)).toBe(next);
    clearSubmittedCampaignSetupDraft(client, next);
    expect(readCampaignSetupDraft(client).openingScene).toEqual({ mode: "default" });
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
