import type { WebContents } from "electron";
import type { InterfaceScale } from "./preferences";

const interfaceScaleZoomMode = "isolated" satisfies ReturnType<WebContents["getZoomMode"]>;

function toZoomFactor(scale: InterfaceScale) {
  return scale / 100;
}

export function createInterfaceScaleWebPreferences(scale: InterfaceScale) {
  return {
    zoomFactor: toZoomFactor(scale),
    // Preserve app-driven zoom without inheriting Chromium's per-origin zoom state.
    zoomMode: interfaceScaleZoomMode,
  } as const;
}

export function applyInterfaceScale(
  contents: Pick<WebContents, "setZoomFactor">,
  scale: InterfaceScale,
) {
  contents.setZoomFactor(toZoomFactor(scale));
}
