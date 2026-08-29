import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createOpenRouterConfiguration, getOpenRouterConnectionStoragePaths } from "./connection";

const directories: string[] = [];

function createUserDataDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-openrouter-"));
  directories.push(directory);
  return directory;
}

function operationSignal() {
  return new AbortController().signal;
}

afterEach(() => {
  vi.restoreAllMocks();

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("OpenRouter connection", () => {
  it("persists an accepted API key without exposing its plaintext", async () => {
    const directory = createUserDataDirectory();
    const apiKey = "openrouter-accepted-key";
    const keyLabel = "sk-or-v1-accepted...123";
    const encrypt = vi.fn(async (value: string) => Buffer.from(`encrypted:${value}`));
    const decrypt = vi.fn(async (value: Buffer) => value.toString().replace("encrypted:", ""));
    const verify = vi.fn(async () => ({ state: "configured" as const, keyLabel }));
    const connection = createOpenRouterConfiguration(directory, { encrypt, decrypt, verify });

    expect(connection.inspect()).toEqual({ state: "unconfigured" });
    await expect(connection.configure(`  ${apiKey}  `, operationSignal())).resolves.toEqual({
      state: "configured",
      keyLabel,
    });
    expect(verify).toHaveBeenCalledWith(apiKey, expect.any(AbortSignal));
    expect(encrypt).toHaveBeenCalledWith(apiKey);

    const [filePath] = getOpenRouterConnectionStoragePaths(directory);
    expect(readFileSync(filePath, "utf8")).not.toContain(apiKey);
    const reopenedConnection = createOpenRouterConfiguration(directory, {
      encrypt,
      decrypt,
      verify,
    });
    expect(reopenedConnection.inspect()).toEqual({ state: "configured", keyLabel });
    expect(verify).toHaveBeenCalledOnce();
    expect(decrypt).not.toHaveBeenCalled();
    await expect(reopenedConnection.withApiKey(async (value) => value)).resolves.toBe(apiKey);
  });

  it("keeps credential use inside the connected provider boundary", async () => {
    const apiKey = "openrouter-scoped-key";
    const encrypt = vi.fn(async (value: string) => Buffer.from(value));
    const decrypt = vi.fn(async (value: Buffer) => value.toString());
    const verify = vi.fn(async () => ({
      state: "configured" as const,
      keyLabel: "sk-or-v1-scoped...123",
    }));
    const connection = createOpenRouterConfiguration(createUserDataDirectory(), {
      encrypt,
      decrypt,
      verify,
    });
    const useApiKey = vi.fn(async (value: string) => `used:${value}`);

    await expect(connection.withApiKey(useApiKey)).rejects.toThrow("OpenRouter is not connected.");
    expect(useApiKey).not.toHaveBeenCalled();

    await connection.configure(apiKey, operationSignal());

    await expect(connection.withApiKey(useApiKey)).resolves.toBe(`used:${apiKey}`);
    expect(useApiKey).toHaveBeenCalledWith(apiKey);
  });

  it("rejects an empty API key before verification", async () => {
    const encrypt = vi.fn(async (value: string) => Buffer.from(value));
    const decrypt = vi.fn(async (value: Buffer) => value.toString());
    const verify = vi.fn(async () => ({
      state: "configured" as const,
      keyLabel: "sk-or-v1-unused...000",
    }));
    const connection = createOpenRouterConfiguration(createUserDataDirectory(), {
      encrypt,
      decrypt,
      verify,
    });

    await expect(connection.configure(" \t ", operationSignal())).rejects.toThrow(TypeError);
    expect(verify).not.toHaveBeenCalled();
    expect(encrypt).not.toHaveBeenCalled();
  });

  it("ignores an invalid credential store", async () => {
    const directory = createUserDataDirectory();
    const [filePath] = getOpenRouterConnectionStoragePaths(directory);
    writeFileSync(filePath, JSON.stringify({ unexpected: "value" }));
    const encrypt = vi.fn(async (value: string) => Buffer.from(value));
    const decrypt = vi.fn(async (value: Buffer) => value.toString());
    const verify = vi.fn(async () => ({
      state: "configured" as const,
      keyLabel: "sk-or-v1-unused...000",
    }));

    const connection = createOpenRouterConfiguration(directory, { encrypt, decrypt, verify });

    expect(connection.inspect()).toEqual({ state: "unconfigured" });
    expect(decrypt).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it.each(["rejected", "unavailable"] as const)(
    "does not persist an API key when verification is %s",
    async (state) => {
      const encrypt = vi.fn(async (value: string) => Buffer.from(value));
      const decrypt = vi.fn(async (value: Buffer) => value.toString());
      const verify = vi.fn(async () => ({ state }));
      const connection = createOpenRouterConfiguration(createUserDataDirectory(), {
        encrypt,
        decrypt,
        verify,
      });

      await expect(
        connection.configure(`openrouter-${state}-key`, operationSignal()),
      ).resolves.toEqual({ state });
      expect(encrypt).not.toHaveBeenCalled();
      expect(connection.inspect()).toEqual({ state: "unconfigured" });
    },
  );

  it("preserves the working connection when a replacement key is rejected", async () => {
    const encrypt = vi.fn(async (value: string) => Buffer.from(`encrypted:${value}`));
    const decrypt = vi.fn(async (value: Buffer) => value.toString().replace("encrypted:", ""));
    const verify = vi.fn(async (apiKey: string) => {
      if (apiKey === "openrouter-replacement-key") {
        return { state: "rejected" as const };
      }

      return { state: "configured" as const, keyLabel: "sk-or-v1-current...789" };
    });
    const connection = createOpenRouterConfiguration(createUserDataDirectory(), {
      encrypt,
      decrypt,
      verify,
    });

    await connection.configure("openrouter-current-key", operationSignal());
    await expect(
      connection.configure("openrouter-replacement-key", operationSignal()),
    ).resolves.toEqual({
      state: "rejected",
    });
    expect(encrypt).not.toHaveBeenCalledWith("openrouter-replacement-key");
    expect(connection.inspect()).toEqual({
      state: "configured",
      keyLabel: "sk-or-v1-current...789",
    });
    await expect(connection.withApiKey(async (value) => value)).resolves.toBe(
      "openrouter-current-key",
    );
  });

  it("preserves encryption failures without changing the connection", async () => {
    const failure = new Error("Encryption failed");
    const encrypt = vi.fn(async () => Buffer.from("encrypted"));
    encrypt.mockRejectedValueOnce(failure);
    const decrypt = vi.fn(async (value: Buffer) => value.toString());
    const verify = vi.fn(async () => ({
      state: "configured" as const,
      keyLabel: "sk-or-v1-test...012",
    }));
    const connection = createOpenRouterConfiguration(createUserDataDirectory(), {
      encrypt,
      decrypt,
      verify,
    });

    await expect(connection.configure("openrouter-first-key", operationSignal())).rejects.toBe(
      failure,
    );
    expect(connection.inspect()).toEqual({ state: "unconfigured" });
    await expect(connection.configure("openrouter-second-key", operationSignal())).resolves.toEqual(
      {
        state: "configured",
        keyLabel: "sk-or-v1-test...012",
      },
    );
  });
});
