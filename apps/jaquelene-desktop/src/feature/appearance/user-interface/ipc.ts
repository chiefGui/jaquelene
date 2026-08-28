import {
  InterfaceScale as IpcInterfaceScale,
  UserInterfacePreferences as UserInterfacePreferencesIpc,
  UiFont as IpcUiFont,
  type UserInterfacePreferenceValues as IpcUserInterfacePreferenceValues,
} from "@jaquelene/ipc/main";
import type { WebContents } from "electron";
import {
  getInterfaceScaleFactor,
  InterfaceScale,
  UiFont,
  type InterfaceScale as InterfaceScaleValue,
  type UserInterfacePreferences,
  type UserInterfacePreferenceValues,
  type UiFont as UiFontValue,
} from "./preferences";

function toIpcScale(scale: InterfaceScaleValue) {
  switch (scale) {
    case InterfaceScale.Percent90:
      return IpcInterfaceScale.Percent90;
    case InterfaceScale.Percent100:
      return IpcInterfaceScale.Percent100;
    case InterfaceScale.Percent110:
      return IpcInterfaceScale.Percent110;
    case InterfaceScale.Percent125:
      return IpcInterfaceScale.Percent125;
  }
}

function fromIpcScale(scale: IpcInterfaceScale): InterfaceScaleValue {
  switch (scale) {
    case IpcInterfaceScale.Percent90:
      return InterfaceScale.Percent90;
    case IpcInterfaceScale.Percent100:
      return InterfaceScale.Percent100;
    case IpcInterfaceScale.Percent110:
      return InterfaceScale.Percent110;
    case IpcInterfaceScale.Percent125:
      return InterfaceScale.Percent125;
  }
}

function toIpcFont(font: UiFontValue) {
  switch (font) {
    case UiFont.System:
      return IpcUiFont.System;
    case UiFont.Inter:
      return IpcUiFont.Inter;
    case UiFont.Geist:
      return IpcUiFont.Geist;
  }
}

function fromIpcFont(font: IpcUiFont): UiFontValue {
  switch (font) {
    case IpcUiFont.System:
      return UiFont.System;
    case IpcUiFont.Inter:
      return UiFont.Inter;
    case IpcUiFont.Geist:
      return UiFont.Geist;
  }
}

function toIpcValues(values: UserInterfacePreferenceValues): IpcUserInterfacePreferenceValues {
  return {
    font: toIpcFont(values.font),
    scale: toIpcScale(values.scale),
  };
}

export function exposeUserInterfacePreferences(
  contents: WebContents,
  preferences: UserInterfacePreferences,
) {
  UserInterfacePreferencesIpc.for(contents.mainFrame).setImplementation({
    get: () => toIpcValues(preferences.get()),
    setFont: (font) => toIpcValues(preferences.setFont(fromIpcFont(font))),
    setScale(scale) {
      const values = preferences.setScale(fromIpcScale(scale));
      contents.setZoomFactor(getInterfaceScaleFactor(values.scale));
      return toIpcValues(values);
    },
  });
}
