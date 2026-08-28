import { describe, expect, it } from "vite-plus/test";
import {
  createUserInterfacePreferences,
  InterfaceScale,
  MotionPreference,
  UiFont,
  type InterfaceScale as InterfaceScaleValue,
  type MotionPreference as MotionPreferenceValue,
  type UiFont as UiFontValue,
  type UserInterfacePreferenceValues,
} from "./preferences";

function createPreferences() {
  let storedValues: UserInterfacePreferenceValues | undefined;

  return createUserInterfacePreferences({
    read: () => storedValues,
    write: (values) => {
      storedValues = values;
    },
  });
}

describe("user interface preferences", () => {
  it("updates each preference without losing the others", () => {
    const preferences = createPreferences();

    expect(preferences.get()).toEqual({
      font: UiFont.Inter,
      scale: InterfaceScale.Percent100,
      motion: MotionPreference.System,
    });
    expect(preferences.setFont(UiFont.Geist)).toEqual({
      font: UiFont.Geist,
      scale: InterfaceScale.Percent100,
      motion: MotionPreference.System,
    });
    expect(preferences.setScale(InterfaceScale.Percent125)).toEqual({
      font: UiFont.Geist,
      scale: InterfaceScale.Percent125,
      motion: MotionPreference.System,
    });
    expect(preferences.setMotion(MotionPreference.Reduced)).toEqual({
      font: UiFont.Geist,
      scale: InterfaceScale.Percent125,
      motion: MotionPreference.Reduced,
    });
  });

  it("rejects an unknown font", () => {
    const preferences = createPreferences();

    expect(() => preferences.setFont("unknown" as UiFontValue)).toThrow(TypeError);
  });

  it("rejects an unsupported scale", () => {
    const preferences = createPreferences();

    expect(() => preferences.setScale(101 as InterfaceScaleValue)).toThrow(TypeError);
  });

  it("rejects an unknown motion preference", () => {
    const preferences = createPreferences();

    expect(() => preferences.setMotion("unknown" as MotionPreferenceValue)).toThrow(TypeError);
  });
});
