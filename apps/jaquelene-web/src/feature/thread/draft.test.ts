import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";
import { threadQueryPrefix } from "@/feature/cache-keys";
import {
  readThreadDraft,
  settleThreadDraft,
  subscribeToThreadDraft,
  writeThreadDraft,
} from "./draft";

describe("thread drafts across navigation", () => {
  it("retains a draft after the composer leaves and keeps campaigns separate", () => {
    const client = new QueryClient();
    const unsubscribe = subscribeToThreadDraft(client, "thread-a", () => {});
    writeThreadDraft(client, "thread-a", "Unsent message");
    unsubscribe();

    expect(readThreadDraft(client, "thread-a").content).toBe("Unsent message");
    expect(readThreadDraft(client, "thread-b").content).toBe("");
    client.clear();
    expect(readThreadDraft(client, "thread-a").content).toBe("");
  });

  it("notifies the active composer synchronously and only for its own draft", () => {
    const client = new QueryClient();
    const changed = vi.fn();
    const unsubscribe = subscribeToThreadDraft(client, "thread-a", changed);
    writeThreadDraft(client, "thread-b", "Other campaign");
    expect(changed).not.toHaveBeenCalled();

    writeThreadDraft(client, "thread-a", "First character");
    expect(changed).toHaveBeenCalled();
    expect(readThreadDraft(client, "thread-a").content).toBe("First character");
    unsubscribe();
    client.clear();
  });

  it("restores a failed submission even after navigating away", () => {
    const client = new QueryClient();
    const submitted = writeThreadDraft(client, "thread-a", "Try this turn");
    const cleared = writeThreadDraft(client, "thread-a", "");
    settleThreadDraft(client, "thread-a", cleared, submitted);
    expect(readThreadDraft(client, "thread-a").content).toBe("Try this turn");
    client.clear();
  });

  it("preserves newer edits, including intentionally clearing the composer", () => {
    const client = new QueryClient();
    const submitted = writeThreadDraft(client, "thread-a", "First turn");
    const cleared = writeThreadDraft(client, "thread-a", "");
    writeThreadDraft(client, "thread-a", "Next turn");
    settleThreadDraft(client, "thread-a", cleared);
    expect(readThreadDraft(client, "thread-a").content).toBe("Next turn");
    writeThreadDraft(client, "thread-a", "");
    settleThreadDraft(client, "thread-a", cleared, submitted);
    expect(readThreadDraft(client, "thread-a").content).toBe("");
    client.clear();
  });

  it("clears submitted drafts and cannot restore text after campaign deletion", () => {
    const client = new QueryClient();
    const submitted = writeThreadDraft(client, "thread-a", "First turn");
    const cleared = writeThreadDraft(client, "thread-a", "");
    client.removeQueries({ queryKey: threadQueryPrefix("thread-a") });
    settleThreadDraft(client, "thread-a", cleared, submitted);
    expect(readThreadDraft(client, "thread-a").content).toBe("");

    const nextCleared = writeThreadDraft(client, "thread-a", "");
    settleThreadDraft(client, "thread-a", nextCleared);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    client.clear();
  });
});
