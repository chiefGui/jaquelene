import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
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

describe("preferences", () => {
  it("persists a default model", () => {
    const directory = createUserDataDirectory();
    const reference = { providerId: "provider-a", modelId: "model-a" };

    expect(createPreferences(directory).setDefaultModel(reference)).toEqual(reference);
    expect(createPreferences(directory).getDefaultModel()).toEqual(reference);
  });

  it("replaces the saved default model", () => {
    const directory = createUserDataDirectory();
    const preferences = createPreferences(directory);
    const replacement = { providerId: "provider-b", modelId: "replacement-model" };
    preferences.setDefaultModel({ providerId: "provider-a", modelId: "initial-model" });

    expect(preferences.setDefaultModel(replacement)).toEqual(replacement);
    expect(preferences.getDefaultModel()).toEqual(replacement);
  });

  it("rejects a reference without provider or model identity", () => {
    const preferences = createPreferences(createUserDataDirectory());

    expect(() => preferences.setDefaultModel({ providerId: " ", modelId: "model-a" })).toThrow(
      TypeError,
    );
  });
});
