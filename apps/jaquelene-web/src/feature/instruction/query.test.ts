import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const instructions = vi.hoisted(() => ({
  createRoleplayInstruction: vi.fn(),
  deleteRoleplayInstruction: vi.fn(),
  getCampaignRoleplayInstructionKey: vi.fn(),
  getDefaultRoleplayInstructionKey: vi.fn(),
  listGroups: vi.fn(),
  setCampaignRoleplayInstructionKey: vi.fn(),
  setDefaultRoleplayInstructionKey: vi.fn(),
  updateRoleplayInstruction: vi.fn(),
}));

vi.mock("@jaquelene/ipc/renderer", () => ({ Instructions: instructions }));

import {
  campaignRoleplayInstructionKeyQuery,
  defaultRoleplayInstructionKeyQuery,
  setDefaultRoleplayInstructionMutationOptions,
} from "./query";

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

describe("default roleplay instruction mutation", () => {
  it("shows the requested default immediately and refreshes inherited campaign selections", async () => {
    const queryClient = createQueryClient();
    const campaignQuery = campaignRoleplayInstructionKeyQuery("campaign-a");
    const save = deferred<string>();
    instructions.setDefaultRoleplayInstructionKey.mockReturnValue(save.promise);
    queryClient.setQueryData(defaultRoleplayInstructionKeyQuery.queryKey, "previous");
    queryClient.setQueryData(campaignQuery.queryKey, "previous");
    const mutation = new MutationObserver(
      queryClient,
      setDefaultRoleplayInstructionMutationOptions(queryClient),
    );

    const result = mutation.mutate("requested");

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(defaultRoleplayInstructionKeyQuery.queryKey)).toBe(
        "requested",
      );
    });

    save.resolve("saved");

    await expect(result).resolves.toBe("saved");
    expect(queryClient.getQueryData(defaultRoleplayInstructionKeyQuery.queryKey)).toBe("saved");
    await vi.waitFor(() => {
      expect(queryClient.getQueryState(campaignQuery.queryKey)?.isInvalidated).toBe(true);
    });
    expect(instructions.getDefaultRoleplayInstructionKey).not.toHaveBeenCalled();
  });

  it("restores the previous default when saving fails", async () => {
    const queryClient = createQueryClient();
    const failure = new Error("Could not persist the default instruction.");
    instructions.setDefaultRoleplayInstructionKey.mockRejectedValue(failure);
    queryClient.setQueryData(defaultRoleplayInstructionKeyQuery.queryKey, "previous");
    const mutation = new MutationObserver(
      queryClient,
      setDefaultRoleplayInstructionMutationOptions(queryClient),
    );

    await expect(mutation.mutate("requested")).rejects.toBe(failure);

    expect(queryClient.getQueryData(defaultRoleplayInstructionKeyQuery.queryKey)).toBe("previous");
  });

  it("removes an optimistic default when no prior cache entry existed", async () => {
    const queryClient = createQueryClient();
    const failure = new Error("Could not persist the default instruction.");
    instructions.setDefaultRoleplayInstructionKey.mockRejectedValue(failure);
    const mutation = new MutationObserver(
      queryClient,
      setDefaultRoleplayInstructionMutationOptions(queryClient),
    );

    await expect(mutation.mutate("requested")).rejects.toBe(failure);

    expect(queryClient.getQueryState(defaultRoleplayInstructionKeyQuery.queryKey)).toBeUndefined();
  });
});
