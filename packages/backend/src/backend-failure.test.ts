import { describe, expect, it, vi } from "vite-plus/test";

const managedRuntime = vi.hoisted(() => ({
  context: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("effect", async (importOriginal) => {
  const effect = await importOriginal<typeof import("effect")>();

  return {
    ...effect,
    ManagedRuntime: {
      ...effect.ManagedRuntime,
      make: () => managedRuntime,
    },
  };
});

import { createBackend } from "./backend";

describe("backend startup failure", () => {
  it("preserves startup and cleanup failures", async () => {
    const startupFailure = new Error("Startup failed.");
    const cleanupFailure = new Error("Cleanup failed.");
    managedRuntime.context.mockRejectedValue(startupFailure);
    managedRuntime.dispose.mockRejectedValue(cleanupFailure);

    let failure: unknown;

    try {
      await createBackend({
        databasePath: "unused.sqlite",
        providers: [],
        storageAreas: [],
      });
    } catch (error) {
      failure = error;
    }

    if (!(failure instanceof AggregateError)) {
      throw new Error("Expected backend startup to fail with an AggregateError.", {
        cause: failure,
      });
    }

    expect(failure.message).toBe("Could not close the backend after it failed to start.");
    expect(failure.errors).toEqual([startupFailure, cleanupFailure]);
    expect(managedRuntime.dispose).toHaveBeenCalledOnce();
  });
});
