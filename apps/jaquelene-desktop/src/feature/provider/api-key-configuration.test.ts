import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createApiKeyConfiguration,
  getApiKeyConfigurationStoragePaths,
  type ApiKeyConfigurationDependencies,
} from "./api-key-configuration";

const directories: string[] = [];

function createUserDataDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-api-key-configuration-"));
  directories.push(directory);
  return directory;
}

function operationSignal() {
  return new AbortController().signal;
}

function dependencies(
  verify: ApiKeyConfigurationDependencies["verify"],
): ApiKeyConfigurationDependencies {
  return {
    encrypt: async (value) => Buffer.from(`encrypted:${value}`),
    decrypt: async (value) => value.toString().replace("encrypted:", ""),
    verify,
  };
}

afterEach(() => {
  vi.restoreAllMocks();

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("API-key configuration", () => {
  it("creates and persists a safe provider-aware label when verification has none", async () => {
    const directory = createUserDataDirectory();
    const apiKey = "sk-nano-123e4567-e89b-12d3-a456-426614174000";
    const configuration = createApiKeyConfiguration(
      directory,
      { id: "provider", name: "Provider", apiKeyPrefixes: ["sk-nano-"] },
      dependencies(async () => ({ state: "configured" })),
    );

    await expect(configuration.configure(apiKey, operationSignal())).resolves.toEqual({
      state: "configured",
      keyLabel: "sk-nano-...4000",
    });
    expect(configuration.inspect()).toEqual({
      state: "configured",
      revision: expect.any(String),
      keyLabel: "sk-nano-...4000",
    });

    const [filePath] = getApiKeyConfigurationStoragePaths(directory, "provider");
    expect(readFileSync(filePath, "utf8")).not.toContain(apiKey);
  });

  it("prefers a safe authoritative label returned by the provider", async () => {
    const configuration = createApiKeyConfiguration(
      createUserDataDirectory(),
      { id: "provider", name: "Provider", apiKeyPrefixes: ["sk-provider-"] },
      dependencies(async () => ({ state: "configured", keyLabel: " provider...1234 " })),
    );

    await expect(
      configuration.configure("sk-provider-secret-1234", operationSignal()),
    ).resolves.toEqual({ state: "configured", keyLabel: "provider...1234" });
  });

  it.each([
    ["123e4567-e89b-12d3-a456-426614174000", "...4000"],
    ["short-key", "••••"],
  ])("safely labels an accepted key without a recognized prefix", async (apiKey, expectedLabel) => {
    const configuration = createApiKeyConfiguration(
      createUserDataDirectory(),
      { id: "provider", name: "Provider", apiKeyPrefixes: ["sk-provider-"] },
      dependencies(async () => ({ state: "configured" })),
    );

    await expect(configuration.configure(apiKey, operationSignal())).resolves.toEqual({
      state: "configured",
      keyLabel: expectedLabel,
    });
  });

  it.each(["", "   ", "sk-provider-secret-1234"])(
    "rejects the unsafe provider label %j without storing the credential",
    async (keyLabel) => {
      const encrypt = vi.fn(async (value: string) => Buffer.from(value));
      const configuration = createApiKeyConfiguration(
        createUserDataDirectory(),
        { id: "provider", name: "Provider" },
        {
          ...dependencies(async () => ({ state: "configured", keyLabel })),
          encrypt,
        },
      );

      await expect(
        configuration.configure("sk-provider-secret-1234", operationSignal()),
      ).rejects.toThrow("Provider returned an unsafe API-key label.");
      expect(encrypt).not.toHaveBeenCalled();
      expect(configuration.inspect()).toEqual({ state: "unconfigured" });
    },
  );

  it("resets a persisted credential that has no required label", async () => {
    const directory = createUserDataDirectory();
    const apiKey = "sk-nano-123e4567-e89b-12d3-a456-426614174000";
    const decrypt = vi.fn(async (value: Buffer) => value.toString());
    const [filePath] = getApiKeyConfigurationStoragePaths(directory, "provider");
    writeFileSync(
      filePath,
      JSON.stringify({
        credential: {
          encryptedApiKey: Buffer.from(`encrypted:${apiKey}`).toString("base64"),
          revision: "existing-revision",
        },
      }),
    );
    const configuration = createApiKeyConfiguration(
      directory,
      { id: "provider", name: "Provider", apiKeyPrefixes: ["sk-nano-"] },
      {
        ...dependencies(async () => ({ state: "configured" })),
        decrypt,
      },
    );

    expect(configuration.inspect()).toEqual({ state: "unconfigured" });
    await expect(configuration.withApiKey(async (value) => value)).rejects.toThrow(
      "Provider is not connected.",
    );
    expect(decrypt).not.toHaveBeenCalled();
  });
});
