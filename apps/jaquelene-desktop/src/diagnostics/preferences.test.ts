import { describe, expect, it } from "vite-plus/test";
import { createDiagnosticsPreferences, type DiagnosticsPreferenceValues } from "./preferences";

function createPreferences() {
  let storedValues: DiagnosticsPreferenceValues | undefined;

  return createDiagnosticsPreferences({
    read: () => storedValues,
    write: (values) => {
      storedValues = values;
    },
  });
}

describe("diagnostics preferences", () => {
  it("enables disk persistence by default and persists explicit changes", () => {
    const preferences = createPreferences();

    expect(preferences.get()).toEqual({ writeToDisk: true });
    expect(preferences.setWriteToDisk(false)).toEqual({ writeToDisk: false });
    expect(preferences.get()).toEqual({ writeToDisk: false });
  });

  it("does not expose its stored values", () => {
    const preferences = createPreferences();
    const values = preferences.setWriteToDisk(false);

    values.writeToDisk = true;

    expect(preferences.get()).toEqual({ writeToDisk: false });
  });

  it("rejects invalid persistence values at the domain boundary", () => {
    const preferences = createPreferences();

    expect(() => preferences.setWriteToDisk("false" as never)).toThrow(TypeError);
    expect(preferences.get()).toEqual({ writeToDisk: true });
  });
});
