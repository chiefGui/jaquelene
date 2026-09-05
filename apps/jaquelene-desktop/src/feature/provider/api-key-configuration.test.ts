import { Effect, Fiber } from "effect";
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
      dependencies(() => Effect.succeed({ state: "configured" })),
    );

    await expect(Effect.runPromise(configuration.configure(apiKey))).resolves.toEqual({
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
      dependencies(() => Effect.succeed({ state: "configured", keyLabel: " provider...1234 " })),
    );

    await expect(
      Effect.runPromise(configuration.configure("sk-provider-secret-1234")),
    ).resolves.toEqual({ state: "configured", keyLabel: "provider...1234" });
  });

  it.each([
    ["123e4567-e89b-12d3-a456-426614174000", "...4000"],
    ["short-key", "••••"],
  ])("safely labels an accepted key without a recognized prefix", async (apiKey, expectedLabel) => {
    const configuration = createApiKeyConfiguration(
      createUserDataDirectory(),
      { id: "provider", name: "Provider", apiKeyPrefixes: ["sk-provider-"] },
      dependencies(() => Effect.succeed({ state: "configured" })),
    );

    await expect(Effect.runPromise(configuration.configure(apiKey))).resolves.toEqual({
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
          ...dependencies(() => Effect.succeed({ state: "configured", keyLabel })),
          encrypt,
        },
      );

      await expect(
        Effect.runPromise(configuration.configure("sk-provider-secret-1234")),
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
        ...dependencies(() => Effect.succeed({ state: "configured" })),
        decrypt,
      },
    );

    expect(configuration.inspect()).toEqual({ state: "unconfigured" });
    await expect(Effect.runPromise(configuration.withApiKey(Effect.succeed))).rejects.toThrow(
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
    const verify = vi.fn(() => Effect.succeed({ state: "configured" as const, keyLabel }));
    const configuration = createApiKeyConfiguration(
      directory,
      { id: "provider", name: "Provider", apiKeyPrefixes: [] },
      { encrypt, decrypt, verify },
    );

    await Effect.runPromise(configuration.configure(apiKey));
    const configured = configuration.inspect();
    const reopened = createApiKeyConfiguration(
      directory,
      { id: "provider", name: "Provider", apiKeyPrefixes: [] },
      { encrypt, decrypt, verify },
    );

    expect(reopened.inspect()).toEqual(configured);
    expect(verify).toHaveBeenCalledOnce();
    expect(decrypt).not.toHaveBeenCalled();
    await expect(Effect.runPromise(reopened.withApiKey(Effect.succeed))).resolves.toBe(apiKey);
  });

  it("keeps credential use inside the configuration boundary", async () => {
    const useApiKey = vi.fn((value: string) => Effect.succeed(`used:${value}`));
    const configuration = createApiKeyConfiguration(
      createUserDataDirectory(),
      { id: "provider", name: "Provider", apiKeyPrefixes: [] },
      dependencies(() => Effect.succeed({ state: "configured", keyLabel: "provider...1234" })),
    );

    await expect(Effect.runPromise(configuration.withApiKey(useApiKey))).rejects.toThrow(
      "Provider is not connected.",
    );
    expect(useApiKey).not.toHaveBeenCalled();

    await Effect.runPromise(configuration.configure("provider-key"));

    await expect(Effect.runPromise(configuration.withApiKey(useApiKey))).resolves.toBe(
      "used:provider-key",
    );
    expect(useApiKey).toHaveBeenCalledWith("provider-key");
  });

  it("rejects an empty API key before verification", async () => {
    const verify = vi.fn(() =>
      Effect.succeed({
        state: "configured" as const,
        keyLabel: "provider...1234",
      }),
    );
    const encrypt = vi.fn(async (value: string) => Buffer.from(value));
    const configuration = createApiKeyConfiguration(
      createUserDataDirectory(),
      { id: "provider", name: "Provider", apiKeyPrefixes: [] },
      {
        ...dependencies(verify),
        encrypt,
      },
    );

    await expect(Effect.runPromise(configuration.configure(" \t "))).rejects.toThrow(TypeError);
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
          ...dependencies(() => Effect.succeed({ state })),
          encrypt,
        },
      );

      await expect(
        Effect.runPromise(configuration.configure(`provider-${state}-key`)),
      ).resolves.toEqual({ state });
      expect(encrypt).not.toHaveBeenCalled();
      expect(configuration.inspect()).toEqual({ state: "unconfigured" });
    },
  );

  it("preserves a working credential when its replacement is rejected", async () => {
    const encrypt = vi.fn(async (value: string) => Buffer.from(`encrypted:${value}`));
    const verify = vi.fn((apiKey: string) => {
      if (apiKey === "replacement-key") {
        return Effect.succeed({ state: "rejected" as const });
      }

      return Effect.succeed({ state: "configured" as const, keyLabel: "provider...1234" });
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

    await Effect.runPromise(configuration.configure("current-key"));
    await expect(Effect.runPromise(configuration.configure("replacement-key"))).resolves.toEqual({
      state: "rejected",
    });
    expect(encrypt).not.toHaveBeenCalledWith("replacement-key");
    await expect(Effect.runPromise(configuration.withApiKey(Effect.succeed))).resolves.toBe(
      "current-key",
    );
  });

  it("preserves encryption failures without changing the credential", async () => {
    const failure = new Error("Encryption failed");
    const encrypt = vi.fn(async () => Buffer.from("encrypted"));
    encrypt.mockRejectedValueOnce(failure);
    const configuration = createApiKeyConfiguration(
      createUserDataDirectory(),
      { id: "provider", name: "Provider", apiKeyPrefixes: [] },
      {
        ...dependencies(() =>
          Effect.succeed({
            state: "configured",
            keyLabel: "provider...1234",
          }),
        ),
        encrypt,
      },
    );

    await expect(Effect.runPromise(configuration.configure("first-key"))).rejects.toBe(failure);
    expect(configuration.inspect()).toEqual({ state: "unconfigured" });
    await expect(Effect.runPromise(configuration.configure("second-key"))).resolves.toEqual({
      state: "configured",
      keyLabel: "provider...1234",
    });
  });

  it("does not commit a credential when interrupted encryption completes later", async () => {
    const started = Promise.withResolvers<void>();
    const encrypted = Promise.withResolvers<Buffer>();
    const encrypt = vi.fn<ApiKeyConfigurationDependencies["encrypt"]>(async (value) =>
      Buffer.from(`encrypted:${value}`),
    );
    const configuration = createApiKeyConfiguration(
      createUserDataDirectory(),
      { id: "provider", name: "Provider", apiKeyPrefixes: [] },
      {
        ...dependencies(() => Effect.succeed({ state: "configured", keyLabel: "provider...1234" })),
        encrypt,
      },
    );
    await Effect.runPromise(configuration.configure("current-key"));
    const current = configuration.inspect();
    encrypt.mockImplementationOnce(() => {
      started.resolve();
      return encrypted.promise;
    });

    const operation = Effect.runFork(configuration.configure("replacement-key"));
    await started.promise;
    await Effect.runPromise(Fiber.interrupt(operation));
    encrypted.resolve(Buffer.from("encrypted:replacement-key"));
    await encrypted.promise;
    await Promise.resolve();

    expect(configuration.inspect()).toEqual(current);
    await expect(Effect.runPromise(configuration.withApiKey(Effect.succeed))).resolves.toBe(
      "current-key",
    );
  });

  it("does not dispatch a request when interrupted decryption completes later", async () => {
    const started = Promise.withResolvers<void>();
    const decrypted = Promise.withResolvers<string>();
    const useApiKey = vi.fn((value: string) => Effect.succeed(`used:${value}`));
    const configuration = createApiKeyConfiguration(
      createUserDataDirectory(),
      { id: "provider", name: "Provider", apiKeyPrefixes: [] },
      {
        ...dependencies(() => Effect.succeed({ state: "configured", keyLabel: "provider...1234" })),
        decrypt() {
          started.resolve();
          return decrypted.promise;
        },
      },
    );
    await Effect.runPromise(configuration.configure("current-key"));

    const operation = Effect.runFork(configuration.withApiKey(useApiKey));
    await started.promise;
    await Effect.runPromise(Fiber.interrupt(operation));
    decrypted.resolve("current-key");
    await decrypted.promise;
    await Promise.resolve();

    expect(useApiKey).not.toHaveBeenCalled();
    expect(configuration.inspect().state).toBe("configured");
  });

  it("aborts verification and ignores a successful result delivered after interruption", async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const verified = Promise.withResolvers<{ state: "configured" }>();
    const encrypt = vi.fn(async (value: string) => Buffer.from(value));
    const configuration = createApiKeyConfiguration(
      createUserDataDirectory(),
      { id: "provider", name: "Provider", apiKeyPrefixes: [] },
      {
        ...dependencies(() =>
          Effect.tryPromise({
            try: (signal) => {
              started.resolve(signal);
              return verified.promise;
            },
            catch: (cause) => cause,
          }),
        ),
        encrypt,
      },
    );

    const operation = Effect.runFork(configuration.configure("current-key"));
    const signal = await started.promise;
    await Effect.runPromise(Fiber.interrupt(operation));
    verified.resolve({ state: "configured" });
    await verified.promise;
    await Promise.resolve();

    expect(signal.aborted).toBe(true);
    expect(encrypt).not.toHaveBeenCalled();
    expect(configuration.inspect()).toEqual({ state: "unconfigured" });
  });
});
