import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createOpenRouterConfiguration,
  getOpenRouterConfigurationStoragePaths,
} from "./configuration";

const directories: string[] = [];

function createUserDataDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-openrouter-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("OpenRouter configuration", () => {
  it("persists an encrypted API key without exposing it through status", async () => {
    const directory = createUserDataDirectory();
    const apiKey = "openrouter-test-key";
    const encrypt = vi.fn(async (value: string) => Buffer.from(`encrypted:${value}`));
    const configuration = createOpenRouterConfiguration(directory, encrypt);

    expect(configuration.getStatus()).toEqual({ configured: false });

    await expect(configuration.configure(`  ${apiKey}  `)).resolves.toEqual({ configured: true });
    expect(encrypt).toHaveBeenCalledWith(apiKey);
    expect(configuration.getStatus()).toEqual({ configured: true });

    const [filePath] = getOpenRouterConfigurationStoragePaths(directory);
    expect(readFileSync(filePath, "utf8")).not.toContain(apiKey);
    expect(createOpenRouterConfiguration(directory, encrypt).getStatus()).toEqual({
      configured: true,
    });
  });

  it("rejects an empty API key before encryption", () => {
    const encrypt = vi.fn(async (value: string) => Buffer.from(value));
    const configuration = createOpenRouterConfiguration(createUserDataDirectory(), encrypt);

    expect(() => configuration.configure(" \t ")).toThrow(TypeError);
    expect(encrypt).not.toHaveBeenCalled();
    expect(configuration.getStatus()).toEqual({ configured: false });
  });

  it("preserves encryption failures without changing configuration", async () => {
    const failure = new Error("Encryption failed");
    const encrypt = vi.fn(async () => Buffer.from("encrypted"));
    encrypt.mockRejectedValueOnce(failure);
    const configuration = createOpenRouterConfiguration(createUserDataDirectory(), encrypt);

    await expect(configuration.configure("openrouter-test-key")).rejects.toBe(failure);
    expect(configuration.getStatus()).toEqual({ configured: false });
    await expect(configuration.configure("replacement-key")).resolves.toEqual({
      configured: true,
    });
  });

  it("applies configuration changes in invocation order", async () => {
    const directory = createUserDataDirectory();
    let finishEncryption!: (value: Buffer) => void;
    const encryptedApiKey = new Promise<Buffer>((resolve) => {
      finishEncryption = resolve;
    });
    const configuration = createOpenRouterConfiguration(directory, () => encryptedApiKey);

    const configuring = configuration.configure("openrouter-test-key");
    const clearing = configuration.clear();
    finishEncryption(Buffer.from("encrypted"));

    await expect(configuring).resolves.toEqual({ configured: true });
    await expect(clearing).resolves.toEqual({ configured: false });
    expect(configuration.getStatus()).toEqual({ configured: false });
    expect(createOpenRouterConfiguration(directory, () => encryptedApiKey).getStatus()).toEqual({
      configured: false,
    });
  });
});
