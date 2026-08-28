import { Preferences as PreferencesIpc } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { Preferences } from "./preferences";

export function exposePreferences(target: WebFrameMain, preferences: Preferences) {
  PreferencesIpc.for(target).setImplementation({
    getDefaultModel: () => preferences.getDefaultModel() ?? null,
    setDefaultModel: preferences.setDefaultModel,
  });
}
