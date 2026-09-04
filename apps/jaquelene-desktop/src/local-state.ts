import { StorageCategory, type StorageArea } from "@jaquelene/backend";
import { ErrorSeverity, type ErrorReporter } from "@jaquelene/diagnostics";
import { Context, Effect, Layer, Schema } from "effect";
import { renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Rectangle } from "electron";
import Store, { type Schema as StoreSchema } from "electron-store";
import { DesktopConfigurationService } from "@/application/configuration";
import { ApplicationDiagnosticsService } from "@/diagnostics/diagnostics";
import { deleteStoreFile } from "@/storage/delete-store-file";

export type MainWindowState = {
  bounds: Rectangle;
  maximized: boolean;
};

type LocalStateData = {
  mainWindow?: MainWindowState;
};

const localStateName = "local-state";

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
} satisfies StoreSchema<LocalStateData>;

function openStore(userDataDirectory: string) {
  return new Store<LocalStateData>({
    cwd: userDataDirectory,
    name: localStateName,
    schema,
    rootSchema: { additionalProperties: false },
  });
}

export function getLocalStateStoragePaths(userDataDirectory: string) {
  const filePath = join(userDataDirectory, `${localStateName}.json`);
  return [filePath, `${filePath}.invalid`] as const;
}

export function createLocalStateStorageArea(
  userDataDirectory: string,
  localState: LocalState,
): StorageArea {
  return {
    id: "local-state",
    category: StorageCategory.AppData,
    paths: getLocalStateStoragePaths(userDataDirectory),
    delete: localState.deleteAll,
  };
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

export function createLocalState(userDataDirectory: string, diagnostics: ErrorReporter) {
  let store: Store<LocalStateData>;
  let skipNextSave = false;

  try {
    store = openStore(userDataDirectory);
  } catch (error) {
    if (!isInvalidLocalState(error)) {
      throw error;
    }

    const [filePath, invalidFilePath] = getLocalStateStoragePaths(userDataDirectory);

    try {
      renameSync(filePath, invalidFilePath);
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        `Could not preserve invalid local state from ${filePath}.`,
      );
    }

    diagnostics.report({
      severity: ErrorSeverity.Warning,
      operation: "local-state.recover",
      error,
    });
    store = openStore(userDataDirectory);
  }

  return {
    deleteAll() {
      deleteStoreFile(store);
      rmSync(getLocalStateStoragePaths(userDataDirectory)[1], { force: true });
      skipNextSave = true;
    },
    loadMainWindowState: (workAreas: readonly Rectangle[]) => {
      const mainWindow = store.get("mainWindow");

      if (!mainWindow) {
        return undefined;
      }

      if (!workAreas.some((workArea) => rectanglesIntersect(mainWindow.bounds, workArea))) {
        return undefined;
      }

      return mainWindow;
    },
    saveMainWindowState: (mainWindow: MainWindowState) => {
      if (skipNextSave) {
        skipNextSave = false;
        return;
      }

      store.set("mainWindow", mainWindow);
    },
  };
}

export type LocalState = ReturnType<typeof createLocalState>;

export class LocalStateInitializationError extends Schema.TaggedError<LocalStateInitializationError>()(
  "LocalStateInitializationError",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class LocalStateService extends Context.Service<LocalStateService, LocalState>()(
  "@jaquelene/desktop/LocalState",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const configuration = yield* DesktopConfigurationService;
      const diagnostics = yield* ApplicationDiagnosticsService;
      return yield* Effect.try({
        try: () =>
          LocalStateService.of(createLocalState(configuration.userDataDirectory, diagnostics)),
        catch: (cause) =>
          new LocalStateInitializationError({
            message: "Could not initialize local state.",
            cause,
          }),
      });
    }),
  );
}
