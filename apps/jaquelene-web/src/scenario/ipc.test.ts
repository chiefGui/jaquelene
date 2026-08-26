import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const rendererIpc = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  rename: vi.fn(),
}));

vi.mock("@jaquelene/ipc/renderer", () => ({ Scenarios: rendererIpc }));

import { scenarioIpc } from "./ipc";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("scenario IPC", () => {
  it("normalizes titles before mutation calls", async () => {
    const created = { id: "created-scenario", title: "Created title" };
    const renamed = { id: "renamed-scenario", title: "Renamed title" };
    rendererIpc.create.mockResolvedValue(created);
    rendererIpc.rename.mockResolvedValue(renamed);

    await expect(scenarioIpc.create("  Created title  ")).resolves.toEqual({
      status: "created",
      scenario: created,
    });
    await expect(scenarioIpc.rename(renamed.id, "  Renamed title  ")).resolves.toEqual({
      status: "renamed",
      scenario: renamed,
    });
    expect(rendererIpc.create).toHaveBeenCalledWith("Created title");
    expect(rendererIpc.rename).toHaveBeenCalledWith(renamed.id, "Renamed title");
  });

  it("does not cross IPC with a title without text", async () => {
    await expect(scenarioIpc.create(" \n\t ")).resolves.toEqual({ status: "empty-title" });
    await expect(scenarioIpc.rename("existing-scenario", " \n\t ")).resolves.toEqual({
      status: "empty-title",
    });
    expect(rendererIpc.create).not.toHaveBeenCalled();
    expect(rendererIpc.rename).not.toHaveBeenCalled();
  });

  it("reports an unknown scenario when renaming", async () => {
    rendererIpc.rename.mockResolvedValue(null);

    await expect(scenarioIpc.rename("missing-scenario", "New title")).resolves.toEqual({
      status: "not-found",
    });
  });
});
