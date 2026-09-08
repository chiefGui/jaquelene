import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  InterfaceScale,
  MotionPreference,
  UiFont,
  UiTheme,
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
  it("adds Markdown defaults to existing preferences without resetting other groups", () => {
    const directory = createUserDataDirectory();
    writeFileSync(
      join(directory, "preferences.json"),
      JSON.stringify({ diagnostics: { writeToDisk: false } }),
    );
    const preferences = createPreferences(directory);
    expect(preferences.markdownEditor.get()).toEqual({
      maxRows: 5,
      showLineCount: true,
      showWordCount: true,
      showCharacterCount: true,
      showEstimatedTokens: true,
    });
    expect(preferences.diagnostics.get()).toEqual({ writeToDisk: false });
    preferences.markdownEditor.setMaxRows(9);
    preferences.markdownEditor.setShowEstimatedTokens(false);
    const restored = createPreferences(directory);
    expect(restored.markdownEditor.get()).toEqual({
      maxRows: 9,
      showLineCount: true,
      showWordCount: true,
      showCharacterCount: true,
      showEstimatedTokens: false,
    });
    expect(restored.diagnostics.get()).toEqual({ writeToDisk: false });
    restored.deleteAll();
    expect(restored.markdownEditor.get()).toEqual({
      maxRows: 5,
      showLineCount: true,
      showWordCount: true,
      showCharacterCount: true,
      showEstimatedTokens: true,
    });
    expect(createPreferences(directory).markdownEditor.get()).toEqual(
      restored.markdownEditor.get(),
    );
  });

  it("persists and changes a regeneration default independently of the campaign default", () => {
    const directory = createUserDataDirectory();
    const campaignModel = {
      providerId: "provider-a",
      modelId: "model-a",
      name: "Model A",
      brandId: "brand-a",
    };
    const regenerationModel = {
      providerId: "provider-b",
      modelId: "model-b",
      name: "Model B",
      brandId: "brand-b",
    };
    const preferences = createPreferences(directory);
    preferences.campaign.setDefaultModel(campaignModel);
    expect(preferences.regeneration.getDefaultModel()).toBeNull();
    const selected = preferences.regeneration.setDefaultModel(regenerationModel);
    expect(selected).toEqual(regenerationModel);
    regenerationModel.name = "Changed input";
    selected.modelId = "Changed output";
    const restored = createPreferences(directory);
    expect(restored.regeneration.getDefaultModel()).toEqual({
      providerId: "provider-b",
      modelId: "model-b",
      name: "Model B",
      brandId: "brand-b",
    });
    expect(restored.campaign.getDefaultModel()).toEqual(campaignModel);
    expect(() => restored.regeneration.setDefaultModel({ ...campaignModel, modelId: " " })).toThrow(
      TypeError,
    );
    expect(createPreferences(directory).regeneration.getDefaultModel()?.modelId).toBe("model-b");
    expect(restored.regeneration.setDefaultModel(campaignModel)).toEqual(campaignModel);
    const updated = createPreferences(directory);
    expect(updated.regeneration.getDefaultModel()).toEqual(campaignModel);
    expect(updated.campaign.getDefaultModel()).toEqual(campaignModel);
  });

  it("opens existing preferences without a regeneration group without resetting them", () => {
    const directory = createUserDataDirectory();
    const defaultModel = {
      providerId: "provider-a",
      modelId: "model-a",
      name: "Model A",
      brandId: "brand-a",
    };
    writeFileSync(
      join(directory, "preferences.json"),
      JSON.stringify({ campaign: { defaultModel }, diagnostics: { writeToDisk: false } }),
    );
    const preferences = createPreferences(directory);
    expect(preferences.campaign.getDefaultModel()).toEqual(defaultModel);
    expect(preferences.diagnostics.get()).toEqual({ writeToDisk: false });
    expect(preferences.regeneration.getDefaultModel()).toBeNull();
  });

  it("persists independently owned preference groups", () => {
    const directory = createUserDataDirectory();
    const preferences = createPreferences(directory);
    const defaultCampaignModel = {
      providerId: "provider-a",
      modelId: "model-a",
      name: "Model A",
      brandId: "brand-a",
    };

    preferences.appearance.userInterface.setTheme(UiTheme.Dracula);
    preferences.appearance.userInterface.setFont(UiFont.Geist);
    preferences.appearance.userInterface.setScale(InterfaceScale.Percent125);
    preferences.appearance.userInterface.setMotion(MotionPreference.Full);
    preferences.campaign.setDefaultModel(defaultCampaignModel);
    preferences.diagnostics.setWriteToDisk(false);

    const restored = createPreferences(directory);
    expect(restored.appearance.userInterface.get()).toEqual({
      theme: UiTheme.Dracula,
      font: UiFont.Geist,
      scale: InterfaceScale.Percent125,
      motion: MotionPreference.Full,
    });
    expect(restored.campaign.getDefaultModel()).toEqual(defaultCampaignModel);
    expect(restored.diagnostics.get()).toEqual({ writeToDisk: false });
  });

  it("clears a default model without its display snapshot", () => {
    const directory = createUserDataDirectory();
    const defaultModel = { providerId: "provider-a", modelId: "model-a" };
    writeFileSync(
      join(directory, "preferences.json"),
      JSON.stringify({ campaign: { defaultModel } }),
    );

    expect(createPreferences(directory).campaign.getDefaultModel()).toBeNull();
  });

  it("resets an incompatible preferences file", () => {
    const directory = createUserDataDirectory();
    writeFileSync(
      join(directory, "preferences.json"),
      JSON.stringify({
        appearance: {
          userInterface: {
            font: UiFont.Geist,
            scale: InterfaceScale.Percent125,
            motion: MotionPreference.Full,
          },
        },
        campaign: {
          defaultModel: {
            providerId: "provider-a",
            modelId: "model-a",
            name: "Model A",
            brandId: "brand-a",
          },
        },
        diagnostics: { writeToDisk: false },
      }),
    );

    const preferences = createPreferences(directory);

    expect(preferences.appearance.userInterface.get()).toEqual({
      theme: UiTheme.Jaquelene,
      font: UiFont.Inter,
      scale: InterfaceScale.Percent100,
      motion: MotionPreference.System,
    });
    expect(preferences.campaign.getDefaultModel()).toBeNull();
    expect(preferences.diagnostics.get()).toEqual({ writeToDisk: true });
  });

  it("deletes every preference group and reports the restored interface defaults", () => {
    const directory = createUserDataDirectory();
    const preferences = createPreferences(directory);
    const listener = vi.fn();
    preferences.appearance.userInterface.subscribe(listener);
    preferences.appearance.userInterface.setFont(UiFont.Geist);
    preferences.campaign.setDefaultModel({
      providerId: "provider-a",
      modelId: "model-a",
      name: "Model A",
      brandId: "brand-a",
    });
    preferences.diagnostics.setWriteToDisk(false);
    preferences.regeneration.setDefaultModel({
      providerId: "provider-b",
      modelId: "model-b",
      name: "Model B",
      brandId: "brand-b",
    });
    listener.mockClear();

    preferences.deleteAll();

    expect(preferences.appearance.userInterface.get()).toEqual({
      theme: UiTheme.Jaquelene,
      font: UiFont.Inter,
      scale: InterfaceScale.Percent100,
      motion: MotionPreference.System,
    });
    expect(preferences.campaign.getDefaultModel()).toBeNull();
    expect(preferences.regeneration.getDefaultModel()).toBeNull();
    expect(preferences.diagnostics.get()).toEqual({ writeToDisk: true });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      theme: UiTheme.Jaquelene,
      font: UiFont.Inter,
      scale: InterfaceScale.Percent100,
      motion: MotionPreference.System,
    });
  });
});
