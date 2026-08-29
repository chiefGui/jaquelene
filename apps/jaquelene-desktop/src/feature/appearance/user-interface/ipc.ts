import {
  InterfaceScale as IpcInterfaceScale,
  MotionPreference as IpcMotionPreference,
  UserInterfacePreferences as UserInterfacePreferencesIpc,
  UiFont as IpcUiFont,
  type UserInterfacePreferenceValues as IpcUserInterfacePreferenceValues,
} from "@jaquelene/ipc/main";
import type { WebContents } from "electron";
import {
  InterfaceScale,
  MotionPreference,
  UiFont,
  type InterfaceScale as InterfaceScaleValue,
  type MotionPreference as MotionPreferenceValue,
  type UserInterfacePreferences,
  type UserInterfacePreferenceValues,
  type UiFont as UiFontValue,
} from "./preferences";
import { applyInterfaceScale } from "./zoom";

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

function toIpcMotion(motion: MotionPreferenceValue) {
  switch (motion) {
    case MotionPreference.System:
      return IpcMotionPreference.System;
    case MotionPreference.Reduced:
      return IpcMotionPreference.Reduced;
    case MotionPreference.Full:
      return IpcMotionPreference.Full;
  }
}

function fromIpcMotion(motion: IpcMotionPreference): MotionPreferenceValue {
  switch (motion) {
    case IpcMotionPreference.System:
      return MotionPreference.System;
    case IpcMotionPreference.Reduced:
      return MotionPreference.Reduced;
    case IpcMotionPreference.Full:
      return MotionPreference.Full;
  }
}

function toIpcValues(values: UserInterfacePreferenceValues): IpcUserInterfacePreferenceValues {
  return {
    font: toIpcFont(values.font),
    scale: toIpcScale(values.scale),
    motion: toIpcMotion(values.motion),
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
      applyInterfaceScale(contents, values.scale);
      return toIpcValues(values);
    },
    setMotion: (motion) => toIpcValues(preferences.setMotion(fromIpcMotion(motion))),
  });
}
