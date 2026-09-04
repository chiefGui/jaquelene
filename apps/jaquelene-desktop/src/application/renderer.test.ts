import { Effect } from "effect";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const harness = vi.hoisted(() => ({
  dispose: vi.fn(),
  getAppPath: vi.fn(() => "application"),
  handleAppScheme: vi.fn(),
  isPackaged: false,
  whenReady: vi.fn(() => Promise.resolve()),
}));

vi.mock("electron", () => ({
  app: {
    getAppPath: harness.getAppPath,
    get isPackaged() {
      return harness.isPackaged;
    },
    whenReady: harness.whenReady,
  },
}));

vi.mock("../app-protocol", () => ({
  appUrl: "app://bundle/",
  handleAppScheme: harness.handleAppScheme,
}));

import { DesktopConfigurationService } from "./configuration";
import { RendererService } from "./renderer";

function readRendererUrl(developmentServerUrl: string | undefined) {
  return Effect.runPromise(
    RendererService.use((renderer) => Effect.succeed(renderer.url)).pipe(
      Effect.provide(RendererService.layer),
      Effect.provide(
        DesktopConfigurationService.layer({
          userDataDirectory: "user-data",
          developmentServerUrl,
        }),
      ),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.isPackaged = false;
  harness.whenReady.mockResolvedValue();
  harness.handleAppScheme.mockReturnValue({ [Symbol.dispose]: harness.dispose });
});

describe("renderer service", () => {
  it("waits for Electron and owns the packaged application protocol", async () => {
    const url = await readRendererUrl(undefined);

    expect(url).toBe("app://bundle/");
    expect(harness.whenReady).toHaveBeenCalledOnce();
    expect(harness.handleAppScheme).toHaveBeenCalledWith(
      join("application", "../jaquelene-web/dist"),
    );
    expect(harness.dispose).toHaveBeenCalledOnce();
  });

  it("uses the development server without installing the application protocol", async () => {
    const url = await readRendererUrl("http://localhost:5173");

    expect(url).toBe("http://localhost:5173");
    expect(harness.whenReady).toHaveBeenCalledOnce();
    expect(harness.handleAppScheme).not.toHaveBeenCalled();
    expect(harness.dispose).not.toHaveBeenCalled();
  });
});
