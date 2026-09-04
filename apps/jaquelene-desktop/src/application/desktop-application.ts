import { Cause, Effect, Exit, Fiber, FiberSet } from "effect";
import { app } from "electron";
import { join } from "node:path";
import { handleAppScheme } from "../app-protocol";
import type { ApplicationDiagnostics } from "../diagnostics/diagnostics";
import type { Preferences } from "../preferences/preferences";
import { createDesktopApplicationLayer } from "./layer";
import { MainWindowService, type MainWindowInspection } from "./main-window";

export type DesktopApplicationInspection = Readonly<{
  state: "starting" | "running" | "stopping" | "stopped";
  window?: MainWindowInspection;
}>;

export type DesktopApplication = Readonly<{
  ready: Promise<void>;
  result: Promise<Exit.Exit<void, Error>>;
  show: () => Promise<void>;
  inspect: () => DesktopApplicationInspection;
  stop: () => Promise<Exit.Exit<void, Error>>;
}>;

function asError(error: unknown, message: string) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(message, { cause: error });
}

function errorFromCause(cause: Cause.Cause<Error>, message: string) {
  const errors = Cause.prettyErrors(cause);

  if (errors.length === 1) {
    return errors[0]!;
  }

  return new AggregateError(errors, message);
}

function waitForSignal<Result>(result: Promise<Result>, signal: AbortSignal) {
  if (signal.aborted) {
    result.catch(() => undefined);
    return Promise.reject(signal.reason);
  }

  let removeListener: (() => void) | undefined;
  const interruption = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    removeListener = () => signal.removeEventListener("abort", onAbort);
  });

  return Promise.race([result, interruption]).finally(removeListener);
}

export function launchDesktopApplication({
  diagnostics,
  preferences,
  userDataDirectory,
  developmentServerUrl,
}: {
  diagnostics: ApplicationDiagnostics;
  preferences: Preferences;
  userDataDirectory: string;
  developmentServerUrl?: string;
}): DesktopApplication {
  const ready = Promise.withResolvers<void>();
  let readySettled = false;
  let state: DesktopApplicationInspection["state"] = "starting";
  let mainWindowInspection: (() => MainWindowInspection) | undefined;
  let showMainWindow: (() => Promise<void>) | undefined;
  const applicationLayer = createDesktopApplicationLayer({
    configuration: { userDataDirectory, developmentServerUrl },
    diagnostics,
    preferences,
  });

  const applicationProgram = Effect.gen(function* () {
    const mainWindow = yield* MainWindowService;
    const runApplicationEffect = yield* FiberSet.makeRuntimePromise();
    mainWindowInspection = mainWindow.inspect;
    showMainWindow = () => runApplicationEffect(mainWindow.show);
    yield* mainWindow.show;

    state = "running";
    readySettled = true;
    ready.resolve();
    yield* Effect.never;
  });
  const program = Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: (signal) => waitForSignal(app.whenReady(), signal),
        catch: (error) => asError(error, "Electron did not become ready."),
      });

      if (!developmentServerUrl) {
        let webAppDirectory = join(app.getAppPath(), "../jaquelene-web/dist");

        if (app.isPackaged) {
          webAppDirectory = join(process.resourcesPath, "web");
        }

        yield* Effect.acquireRelease(
          Effect.sync(() => handleAppScheme(webAppDirectory)),
          (registration) => Effect.sync(() => registration[Symbol.dispose]()),
        );
      }

      yield* applicationProgram.pipe(Effect.provide(applicationLayer));
    }),
  );
  const fiber = Effect.runFork(program);
  const result = Effect.runPromise(Fiber.await(fiber));
  let stopPromise: Promise<Exit.Exit<void, Error>> | undefined;

  void result.then((exit) => {
    state = "stopped";

    if (!readySettled) {
      readySettled = true;
      let error = new Error("Desktop application stopped before becoming ready.");

      if (Exit.isFailure(exit)) {
        error = errorFromCause(exit.cause, "Desktop application startup failed.");
      }

      ready.reject(error);
    }
  });

  function stop() {
    if (!stopPromise) {
      if (state !== "stopped") {
        state = "stopping";
      }

      stopPromise = Effect.runPromise(Fiber.interrupt(fiber)).then(() => result);
    }

    return stopPromise;
  }

  return {
    ready: ready.promise,
    result,
    show: async () => {
      await ready.promise;

      if (!showMainWindow || state !== "running") {
        throw new Error("Desktop application is not running.");
      }
      await showMainWindow();
    },
    inspect: () => {
      const inspection: {
        state: DesktopApplicationInspection["state"];
        window?: MainWindowInspection;
      } = { state };

      if (mainWindowInspection) {
        inspection.window = mainWindowInspection();
      }

      return inspection;
    },
    stop,
  };
}
