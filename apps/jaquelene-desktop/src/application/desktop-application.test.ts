import { Cause, Effect, Exit, Layer } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ApplicationDiagnostics } from "../diagnostics/diagnostics";
import type { Preferences } from "../preferences/preferences";

type TestMainWindow = Readonly<{
  show: Effect.Effect<void, Error>;
  inspect: () => Readonly<{
    state: "open" | "closing" | "closed";
    window: "absent" | "opening" | "open" | "closing";
  }>;
}>;

const harness = vi.hoisted(() => ({
  createDesktopApplicationLayer: vi.fn(),
}));

vi.mock("./main-window", async () => {
  const { Context } = await import("effect");
  class MainWindowService extends Context.Service<MainWindowService, TestMainWindow>()(
    "@jaquelene/desktop/test/MainWindow",
  ) {}

  return { MainWindowService };
});

vi.mock("./layer", () => ({
  createDesktopApplicationLayer: harness.createDesktopApplicationLayer,
}));

import { launchDesktopApplication } from "./desktop-application";
import { MainWindowService } from "./main-window";

const diagnostics = {} as ApplicationDiagnostics;
const preferences = {} as Preferences;

describe("desktop application", () => {
  it("owns its service layer until the application stops", async () => {
    const order: string[] = [];
    const mainWindow = MainWindowService.of({
      show: Effect.sync(() => order.push("window.show")),
      inspect: () => ({ state: "open", window: "open" }),
    });
    const applicationLayer = Layer.effect(
      MainWindowService,
      Effect.acquireRelease(Effect.succeed(mainWindow), () =>
        Effect.sync(() => order.push("runtime.dispose")),
      ),
    );
    harness.createDesktopApplicationLayer.mockReturnValue(applicationLayer);

    const application = launchDesktopApplication({
      diagnostics,
      preferences,
      userDataDirectory: "user-data",
      developmentServerUrl: undefined,
    });
    await application.ready;

    expect(application.inspect()).toEqual({
      state: "running",
      window: { state: "open", window: "open" },
    });
    await application.show();
    expect(order).toEqual(["window.show", "window.show"]);

    const stopping = application.stop();
    expect(application.stop()).toBe(stopping);
    const exit = await stopping;

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    }
    expect(order).toEqual(["window.show", "window.show", "runtime.dispose"]);
    expect(application.inspect().state).toBe("stopped");
    await expect(application.show()).rejects.toThrow("Desktop application is not running.");
  });

  it("disposes its service layer when startup fails", async () => {
    const failure = new Error("The main window could not open.");
    const dispose = vi.fn();
    const mainWindow = MainWindowService.of({
      show: Effect.die(failure),
      inspect: () => ({ state: "open", window: "absent" }),
    });
    const applicationLayer = Layer.effect(
      MainWindowService,
      Effect.acquireRelease(Effect.succeed(mainWindow), () => Effect.sync(dispose)),
    );
    harness.createDesktopApplicationLayer.mockReturnValue(applicationLayer);

    const application = launchDesktopApplication({
      diagnostics,
      preferences,
      userDataDirectory: "user-data",
      developmentServerUrl: undefined,
    });

    await expect(application.ready).rejects.toThrow(failure.message);
    const exit = await application.result;

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.prettyErrors(exit.cause).map((error) => error.message)).toContain(
        failure.message,
      );
    }
    expect(dispose).toHaveBeenCalledOnce();
    expect(application.inspect().state).toBe("stopped");
  });
});
