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
  it("forwards object-shaped mutation requests", async () => {
    const created = { id: "created-scenario", title: "Created title" };
    const renamed = { id: "renamed-scenario", title: "Renamed title" };
    rendererIpc.create.mockResolvedValue(created);
    rendererIpc.rename.mockResolvedValue(renamed);

    await expect(scenarioIpc.create({ title: "Created title" })).resolves.toEqual(created);
    await expect(scenarioIpc.rename({ id: renamed.id, title: "Renamed title" })).resolves.toEqual(
      renamed,
    );
    expect(rendererIpc.create).toHaveBeenCalledWith({ title: "Created title" });
    expect(rendererIpc.rename).toHaveBeenCalledWith({
      id: renamed.id,
      title: "Renamed title",
    });
  });
});
