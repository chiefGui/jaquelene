import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createLocalState, type MainWindowState } from "./local-state";

const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
const directories: string[] = [];

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
  it("returns no main-window state when none has been saved", () => {
    const localState = createLocalState(createUserDataDirectory());

    expect(localState.loadMainWindowState([workArea])).toBeUndefined();
  });

  it("persists and restores the main-window state", () => {
    const directory = createUserDataDirectory();
    const expected: MainWindowState = {
      bounds: { x: 101, y: 202, width: 1103, height: 704 },
      maximized: true,
    };

    createLocalState(directory).saveMainWindowState(expected);

    expect(createLocalState(directory).loadMainWindowState([workArea])).toEqual(expected);
  });

  it("does not restore a main window that is outside every current display", () => {
    const directory = createUserDataDirectory();
    const localState = createLocalState(directory);
    localState.saveMainWindowState({
      bounds: { x: 3000, y: 2000, width: 800, height: 600 },
      maximized: false,
    });

    expect(localState.loadMainWindowState([workArea])).toBeUndefined();
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
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const replacement: MainWindowState = {
      bounds: { x: 303, y: 404, width: 1005, height: 606 },
      maximized: false,
    };

    const localState = createLocalState(directory);
    expect(localState.loadMainWindowState([workArea])).toBeUndefined();
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining("Invalid local state was preserved"),
      expect.any(errorType),
    );
    expect(readFileSync(join(directory, "local-state.json.invalid"), "utf8")).toBe(invalidState);

    localState.saveMainWindowState(replacement);
    expect(createLocalState(directory).loadMainWindowState([workArea])).toEqual(replacement);
  });
});
