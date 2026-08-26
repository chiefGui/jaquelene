import { renameSync } from "node:fs";
import { join } from "node:path";
import type { Rectangle } from "electron";
import Store, { type Schema } from "electron-store";

export type MainWindowState = {
  bounds: Rectangle;
  maximized: boolean;
};

type LocalStateData = {
  mainWindow?: MainWindowState;
};

const schema = {
  mainWindow: {
    type: "object",
    additionalProperties: false,
    properties: {
      bounds: {
        type: "object",
        additionalProperties: false,
        properties: {
          x: { type: "integer" },
          y: { type: "integer" },
          width: { type: "integer", minimum: 1 },
          height: { type: "integer", minimum: 1 },
        },
        required: ["x", "y", "width", "height"],
      },
      maximized: { type: "boolean" },
    },
    required: ["bounds", "maximized"],
  },
} satisfies Schema<LocalStateData>;

function openStore(userDataDirectory: string) {
  return new Store<LocalStateData>({
    cwd: userDataDirectory,
    name: "local-state",
    schema,
    rootSchema: { additionalProperties: false },
  });
}

function isInvalidLocalState(error: unknown) {
  return (
    error instanceof SyntaxError ||
    (error instanceof Error && error.message.startsWith("Config schema violation:"))
  );
}

function rectanglesIntersect(left: Rectangle, right: Rectangle) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

export function createLocalState(userDataDirectory: string) {
  let store: Store<LocalStateData>;

  try {
    store = openStore(userDataDirectory);
  } catch (error) {
    if (!isInvalidLocalState(error)) {
      throw error;
    }

    const filePath = join(userDataDirectory, "local-state.json");
    const invalidFilePath = `${filePath}.invalid`;

    try {
      renameSync(filePath, invalidFilePath);
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        `Could not preserve invalid local state from ${filePath}.`,
      );
    }

    console.error(`Invalid local state was preserved at ${invalidFilePath}.`, error);
    store = openStore(userDataDirectory);
  }

  return {
    loadMainWindowState: (workAreas: readonly Rectangle[]) => {
      const mainWindow = store.get("mainWindow");
      return mainWindow &&
        workAreas.some((workArea) => rectanglesIntersect(mainWindow.bounds, workArea))
        ? mainWindow
        : undefined;
    },
    saveMainWindowState: (mainWindow: MainWindowState) => {
      store.set("mainWindow", mainWindow);
    },
  };
}

export type LocalState = ReturnType<typeof createLocalState>;
