import type { ErrorReporter } from "@jaquelene/diagnostics";
import { Layer, ManagedRuntime } from "effect";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { DesktopConfigurationService } from "./application/configuration";
import {
  ApplicationDiagnosticsService,
  type ApplicationDiagnostics,
} from "./diagnostics/diagnostics";
import {
  createLocalState,
  LocalStateInitializationError,
  LocalStateService,
  type MainWindowState,
} from "./local-state";

const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
const directories: string[] = [];
const ignoredDiagnostics: ErrorReporter = { report() {} };

function createTestLocalState(directory: string, diagnostics = ignoredDiagnostics) {
  return createLocalState(directory, diagnostics);
}

function createUserDataDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-local-state-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local state", () => {
  it("reports initialization failures through the typed Effect channel", async () => {
    const close = async () => undefined;
    const diagnostics = {
      report() {},
      recordRendererReport() {},
      deleteAll: async () => undefined,
      openDirectory: async () => undefined,
      inspect: () => ({ state: "open" as const }),
      close,
      [Symbol.asyncDispose]: close,
    } satisfies ApplicationDiagnostics;
    const dependencies = Layer.merge(
      DesktopConfigurationService.layer({
        userDataDirectory: "\0",
        developmentServerUrl: undefined,
      }),
      ApplicationDiagnosticsService.layer(diagnostics),
    );
    const runtime = ManagedRuntime.make(LocalStateService.layer.pipe(Layer.provide(dependencies)));

    try {
      await expect(runtime.runPromise(LocalStateService)).rejects.toBeInstanceOf(
        LocalStateInitializationError,
      );
    } finally {
      await runtime.dispose();
    }
  });

  it("returns no main-window state when none has been saved", () => {
    const localState = createTestLocalState(createUserDataDirectory());

    expect(localState.loadMainWindowState([workArea])).toBeUndefined();
  });

  it("persists and restores the main-window state", () => {
    const directory = createUserDataDirectory();
    const expected: MainWindowState = {
      bounds: { x: 101, y: 202, width: 1103, height: 704 },
      maximized: true,
    };

    createTestLocalState(directory).saveMainWindowState(expected);

    expect(createTestLocalState(directory).loadMainWindowState([workArea])).toEqual(expected);
  });

  it("does not restore a main window that is outside every current display", () => {
    const directory = createUserDataDirectory();
    const localState = createTestLocalState(directory);
    localState.saveMainWindowState({
      bounds: { x: 3000, y: 2000, width: 800, height: 600 },
      maximized: false,
    });

    expect(localState.loadMainWindowState([workArea])).toBeUndefined();
  });

  it("deletes saved state and does not recreate it when the current window closes", () => {
    const directory = createUserDataDirectory();
    const localState = createTestLocalState(directory);
    const saved: MainWindowState = {
      bounds: { x: 101, y: 202, width: 1103, height: 704 },
      maximized: true,
    };
    localState.saveMainWindowState(saved);
    writeFileSync(join(directory, "local-state.json.invalid"), "invalid", "utf8");

    localState.deleteAll();
    localState.saveMainWindowState(saved);

    expect(localState.loadMainWindowState([workArea])).toBeUndefined();
    expect(existsSync(join(directory, "local-state.json.invalid"))).toBe(false);

    localState.saveMainWindowState(saved);
    expect(localState.loadMainWindowState([workArea])).toEqual(saved);
  });

  it.each([
    ["malformed JSON", "not json", SyntaxError],
    [
      "schema-invalid JSON",
      JSON.stringify({
        mainWindow: {
          bounds: { x: 7, y: 8, width: 0, height: 609 },
          maximized: false,
        },
      }),
      Error,
    ],
  ])("reports and preserves %s before replacing it", (_name, invalidState, errorType) => {
    const directory = createUserDataDirectory();
    writeFileSync(join(directory, "local-state.json"), invalidState, "utf8");
    const report = vi.fn();
    const replacement: MainWindowState = {
      bounds: { x: 303, y: 404, width: 1005, height: 606 },
      maximized: false,
    };

    const localState = createTestLocalState(directory, { report });
    expect(localState.loadMainWindowState([workArea])).toBeUndefined();
    expect(report).toHaveBeenCalledWith({
      severity: "warning",
      operation: "local-state.recover",
      error: expect.any(errorType),
    });
    expect(readFileSync(join(directory, "local-state.json.invalid"), "utf8")).toBe(invalidState);

    localState.saveMainWindowState(replacement);
    expect(createTestLocalState(directory).loadMainWindowState([workArea])).toEqual(replacement);
  });
});
