import { describe, expect, it, vi } from "vite-plus/test";
import {
  createUserInterfacePreferences,
  InterfaceScale,
  MotionPreference,
  UiFont,
  UiTheme,
  type InterfaceScale as InterfaceScaleValue,
  type MotionPreference as MotionPreferenceValue,
  type UiFont as UiFontValue,
  type UiTheme as UiThemeValue,
  type UserInterfacePreferenceValues,
} from "./preferences";

function createPreferences() {
  let storedValues: UserInterfacePreferenceValues | undefined;
  const listeners = new Set<() => void>();

  return createUserInterfacePreferences({
    read: () => storedValues,
    write: (values) => {
      storedValues = values;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

describe("user interface preferences", () => {
  it("updates each preference without losing the others", () => {
    const preferences = createPreferences();

    expect(preferences.get()).toEqual({
      theme: UiTheme.Jaquelene,
      font: UiFont.Inter,
      scale: InterfaceScale.Percent100,
      motion: MotionPreference.System,
    });
    expect(preferences.setTheme(UiTheme.Dracula)).toEqual({
      theme: UiTheme.Dracula,
      font: UiFont.Inter,
      scale: InterfaceScale.Percent100,
      motion: MotionPreference.System,
    });
    expect(preferences.setFont(UiFont.Geist)).toEqual({
      theme: UiTheme.Dracula,
      font: UiFont.Geist,
      scale: InterfaceScale.Percent100,
      motion: MotionPreference.System,
    });
    expect(preferences.setScale(InterfaceScale.Percent125)).toEqual({
      theme: UiTheme.Dracula,
      font: UiFont.Geist,
      scale: InterfaceScale.Percent125,
      motion: MotionPreference.System,
    });
    expect(preferences.setMotion(MotionPreference.Reduced)).toEqual({
      theme: UiTheme.Dracula,
      font: UiFont.Geist,
      scale: InterfaceScale.Percent125,
      motion: MotionPreference.Reduced,
    });
  });

  it("reports current values after a change", () => {
    const preferences = createPreferences();
    const listener = vi.fn();
    const unsubscribe = preferences.subscribe(listener);

    preferences.setScale(InterfaceScale.Percent125);
    expect(listener).toHaveBeenLastCalledWith({
      theme: UiTheme.Jaquelene,
      font: UiFont.Inter,
      scale: InterfaceScale.Percent125,
      motion: MotionPreference.System,
    });

    unsubscribe();
    preferences.setScale(InterfaceScale.Percent100);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("rejects an unknown font", () => {
    const preferences = createPreferences();

    expect(() => preferences.setFont("unknown" as UiFontValue)).toThrow(TypeError);
  });

  it("rejects an unknown theme", () => {
    const preferences = createPreferences();

    expect(() => preferences.setTheme("unknown" as UiThemeValue)).toThrow(TypeError);
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
