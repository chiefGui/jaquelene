import { RegenerationPreferences as RegenerationPreferencesIpc } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { RegenerationPreferences } from "./regeneration-preferences";

export function exposeRegenerationPreferences(
  target: WebFrameMain,
  preferences: RegenerationPreferences,
) {
  RegenerationPreferencesIpc.for(target).setImplementation({
    getDefaultModel: preferences.getDefaultModel,
    setDefaultModel: preferences.setDefaultModel,
  });
}
