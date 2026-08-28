import { ModelPreferences as ModelPreferencesIpc } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { ModelPreferences } from "./preferences";

export function exposeModelPreferences(target: WebFrameMain, preferences: ModelPreferences) {
  ModelPreferencesIpc.for(target).setImplementation({
    get: preferences.get,
    setDefault: preferences.setDefault,
  });
}
