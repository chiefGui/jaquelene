import type { AiActionRunner } from "@jaquelene/backend";
import type { ErrorReporter } from "@jaquelene/diagnostics";
import {
  AiActionRunner as AiActionRunnerIpc,
  AiActionPreferences as AiActionPreferencesIpc,
} from "@jaquelene/ipc/main";
import type { WebContents } from "electron";
import type { AiActionPreferences } from "./preferences";
import { createAiActionSession, type AiActionEffectRunner } from "./session";

export function exposeAiActions(
  target: WebContents,
  runner: AiActionRunner,
  preferences: AiActionPreferences,
  runEffect: AiActionEffectRunner,
  diagnostics: ErrorReporter,
) {
  const session = createAiActionSession(runner, preferences, runEffect, diagnostics);
  AiActionRunnerIpc.for(target.mainFrame).setImplementation({
    list: (scope) => [...runner.list(scope)],
    run: session.run,
    cancel: session.cancel,
  });
  AiActionPreferencesIpc.for(target.mainFrame).setImplementation(preferences);

  const cancelForNavigation = (
    _event: Electron.Event,
    _url: string,
    isInPlace: boolean,
    isMainFrame: boolean,
  ) => {
    if (isMainFrame && !isInPlace) {
      void session.cancelAll();
    }
  };
  const dispose = () => {
    target.off("destroyed", dispose);
    target.off("render-process-gone", session.cancelAll);
    target.off("did-start-navigation", cancelForNavigation);
    return session.close();
  };
  target.once("destroyed", dispose);
  target.on("render-process-gone", session.cancelAll);
  target.on("did-start-navigation", cancelForNavigation);
  return dispose;
}
