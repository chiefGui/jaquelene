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
        { id: "provider", name: "Provider", apiKeyPrefixes: [] },
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

  it("reopens a persisted credential without verification or decryption", async () => {
    const directory = createUserDataDirectory();
    const apiKey = "provider-accepted-key";
    const keyLabel = "provider...1234";
    const encrypt = vi.fn(async (value: string) => Buffer.from(`encrypted:${value}`));
    const decrypt = vi.fn(async (value: Buffer) => value.toString().replace("encrypted:", ""));
    const verify = vi.fn(async () => ({ state: "configured" as const, keyLabel }));
    const configuration = createApiKeyConfiguration(
      directory,
      { id: "provider", name: "Provider", apiKeyPrefixes: [] },
      { encrypt, decrypt, verify },
    );

    await configuration.configure(apiKey, operationSignal());
    const configured = configuration.inspect();
    const reopened = createApiKeyConfiguration(
      directory,
      { id: "provider", name: "Provider", apiKeyPrefixes: [] },
      { encrypt, decrypt, verify },
    );

    expect(reopened.inspect()).toEqual(configured);
    expect(verify).toHaveBeenCalledOnce();
    expect(decrypt).not.toHaveBeenCalled();
    await expect(reopened.withApiKey(async (value) => value)).resolves.toBe(apiKey);
  });

  it("keeps credential use inside the configuration boundary", async () => {
    const useApiKey = vi.fn(async (value: string) => `used:${value}`);
    const configuration = createApiKeyConfiguration(
      createUserDataDirectory(),
      { id: "provider", name: "Provider", apiKeyPrefixes: [] },
      dependencies(async () => ({ state: "configured", keyLabel: "provider...1234" })),
    );

    await expect(configuration.withApiKey(useApiKey)).rejects.toThrow("Provider is not connected.");
    expect(useApiKey).not.toHaveBeenCalled();

    await configuration.configure("provider-key", operationSignal());

    await expect(configuration.withApiKey(useApiKey)).resolves.toBe("used:provider-key");
    expect(useApiKey).toHaveBeenCalledWith("provider-key");
  });

  it("rejects an empty API key before verification", async () => {
    const verify = vi.fn(async () => ({
      state: "configured" as const,
      keyLabel: "provider...1234",
    }));
    const encrypt = vi.fn(async (value: string) => Buffer.from(value));
    const configuration = createApiKeyConfiguration(
      createUserDataDirectory(),
      { id: "provider", name: "Provider", apiKeyPrefixes: [] },
      {
        ...dependencies(verify),
        encrypt,
      },
    );

    await expect(configuration.configure(" \t ", operationSignal())).rejects.toThrow(TypeError);
    expect(verify).not.toHaveBeenCalled();
    expect(encrypt).not.toHaveBeenCalled();
  });

  it.each(["rejected", "unavailable"] as const)(
    "does not persist an API key when verification is %s",
    async (state) => {
      const encrypt = vi.fn(async (value: string) => Buffer.from(value));
      const configuration = createApiKeyConfiguration(
        createUserDataDirectory(),
        { id: "provider", name: "Provider", apiKeyPrefixes: [] },
        {
          ...dependencies(async () => ({ state })),
          encrypt,
        },
      );

      await expect(
        configuration.configure(`provider-${state}-key`, operationSignal()),
      ).resolves.toEqual({ state });
      expect(encrypt).not.toHaveBeenCalled();
      expect(configuration.inspect()).toEqual({ state: "unconfigured" });
    },
  );

  it("preserves a working credential when its replacement is rejected", async () => {
    const encrypt = vi.fn(async (value: string) => Buffer.from(`encrypted:${value}`));
    const verify = vi.fn(async (apiKey: string) => {
      if (apiKey === "replacement-key") {
        return { state: "rejected" as const };
      }

      return { state: "configured" as const, keyLabel: "provider...1234" };
    });
    const configuration = createApiKeyConfiguration(
      createUserDataDirectory(),
      { id: "provider", name: "Provider", apiKeyPrefixes: [] },
      {
        encrypt,
        decrypt: async (value) => value.toString().replace("encrypted:", ""),
        verify,
      },
    );

    await configuration.configure("current-key", operationSignal());
    await expect(configuration.configure("replacement-key", operationSignal())).resolves.toEqual({
      state: "rejected",
    });
    expect(encrypt).not.toHaveBeenCalledWith("replacement-key");
    await expect(configuration.withApiKey(async (value) => value)).resolves.toBe("current-key");
  });

  it("preserves encryption failures without changing the credential", async () => {
    const failure = new Error("Encryption failed");
    const encrypt = vi.fn(async () => Buffer.from("encrypted"));
    encrypt.mockRejectedValueOnce(failure);
    const configuration = createApiKeyConfiguration(
      createUserDataDirectory(),
      { id: "provider", name: "Provider", apiKeyPrefixes: [] },
      {
        ...dependencies(async () => ({
          state: "configured",
          keyLabel: "provider...1234",
        })),
        encrypt,
      },
    );

    await expect(configuration.configure("first-key", operationSignal())).rejects.toBe(failure);
    expect(configuration.inspect()).toEqual({ state: "unconfigured" });
    await expect(configuration.configure("second-key", operationSignal())).resolves.toEqual({
      state: "configured",
      keyLabel: "provider...1234",
    });
  });
});
