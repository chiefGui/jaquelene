import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { InterfaceScale, UiFont } from "@/feature/appearance/user-interface/preferences";
import { createPreferences } from "./preferences";

const directories: string[] = [];

function createUserDataDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-preferences-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("preferences storage", () => {
  it("persists independently owned preference groups", () => {
    const directory = createUserDataDirectory();
    const preferences = createPreferences(directory);
    const defaultModel = { providerId: "provider-a", modelId: "model-a" };

    preferences.appearance.userInterface.setFont(UiFont.Geist);
    preferences.appearance.userInterface.setScale(InterfaceScale.Percent125);
    preferences.model.setDefault(defaultModel);

    const restored = createPreferences(directory);
    expect(restored.appearance.userInterface.get()).toEqual({
      font: UiFont.Geist,
      scale: InterfaceScale.Percent125,
    });
    expect(restored.model.get()).toEqual({ default: defaultModel });
  });
});
