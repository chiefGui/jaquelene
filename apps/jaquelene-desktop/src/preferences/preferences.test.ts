import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  InterfaceScale,
  MotionPreference,
  UiFont,
} from "@/feature/appearance/user-interface/preferences";
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
    const defaultCampaignModel = {
      providerId: "provider-a",
      modelId: "model-a",
      name: "Model A",
      brandId: "brand-a",
    };

    preferences.appearance.userInterface.setFont(UiFont.Geist);
    preferences.appearance.userInterface.setScale(InterfaceScale.Percent125);
    preferences.appearance.userInterface.setMotion(MotionPreference.Full);
    preferences.campaign.setDefaultModel(defaultCampaignModel);

    const restored = createPreferences(directory);
    expect(restored.appearance.userInterface.get()).toEqual({
      font: UiFont.Geist,
      scale: InterfaceScale.Percent125,
      motion: MotionPreference.Full,
    });
    expect(restored.campaign.getDefaultModel()).toEqual(defaultCampaignModel);
  });

  it("preserves model references saved before display snapshots", () => {
    const directory = createUserDataDirectory();
    const defaultModel = { providerId: "provider-a", modelId: "model-a" };
    writeFileSync(
      join(directory, "preferences.json"),
      JSON.stringify({ campaign: { defaultModel } }),
    );

    expect(createPreferences(directory).campaign.getDefaultModel()).toEqual(defaultModel);
  });
});
