import { describe, expect, it } from "vite-plus/test";
import {
  createUserInterfacePreferences,
  InterfaceScale,
  UiFont,
  type InterfaceScale as InterfaceScaleValue,
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
  it("updates font and scale without losing either value", () => {
    const preferences = createPreferences();

    expect(preferences.get()).toEqual({
      font: UiFont.Inter,
      scale: InterfaceScale.Percent100,
    });
    expect(preferences.setFont(UiFont.Geist)).toEqual({
      font: UiFont.Geist,
      scale: InterfaceScale.Percent100,
    });
    expect(preferences.setScale(InterfaceScale.Percent125)).toEqual({
      font: UiFont.Geist,
      scale: InterfaceScale.Percent125,
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
});
