import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createOpenRouterConnection, getOpenRouterConnectionStoragePaths } from "./connection";
import type { OpenRouterVerification } from "./verification";

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

describe("OpenRouter connection", () => {
  it("persists an accepted API key without exposing its plaintext", async () => {
    const directory = createUserDataDirectory();
    const apiKey = "openrouter-accepted-key";
    const keyLabel = "sk-or-v1-accepted...123";
    const encrypt = vi.fn(async (value: string) => Buffer.from(`encrypted:${value}`));
    const decrypt = vi.fn(async (value: Buffer) => value.toString().replace("encrypted:", ""));
    const verify = vi.fn(async () => ({ state: "connected" as const, keyLabel }));
    const connection = createOpenRouterConnection(directory, { encrypt, decrypt, verify });

    await expect(connection.getStatus()).resolves.toEqual({ state: "disconnected" });
    await expect(connection.connect(`  ${apiKey}  `)).resolves.toEqual({
      state: "connected",
      keyLabel,
    });
    expect(verify).toHaveBeenCalledWith(apiKey);
    expect(encrypt).toHaveBeenCalledWith(apiKey);

    const [filePath] = getOpenRouterConnectionStoragePaths(directory);
    expect(readFileSync(filePath, "utf8")).not.toContain(apiKey);
    await expect(
      createOpenRouterConnection(directory, { encrypt, decrypt, verify }).getStatus(),
    ).resolves.toEqual({ state: "connected", keyLabel });
  });

  it("rejects an empty API key before verification", () => {
    const encrypt = vi.fn(async (value: string) => Buffer.from(value));
    const decrypt = vi.fn(async (value: Buffer) => value.toString());
    const verify = vi.fn(async () => ({
      state: "connected" as const,
      keyLabel: "sk-or-v1-unused...000",
    }));
    const connection = createOpenRouterConnection(createUserDataDirectory(), {
      encrypt,
      decrypt,
      verify,
    });

    expect(() => connection.connect(" \t ")).toThrow(TypeError);
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
      state: "connected" as const,
      keyLabel: "sk-or-v1-unused...000",
    }));

    const connection = createOpenRouterConnection(directory, { encrypt, decrypt, verify });

    await expect(connection.getStatus()).resolves.toEqual({ state: "disconnected" });
    expect(decrypt).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it.each(["rejected", "unavailable"] as const)(
    "does not persist an API key when verification is %s",
    async (state) => {
      const encrypt = vi.fn(async (value: string) => Buffer.from(value));
      const decrypt = vi.fn(async (value: Buffer) => value.toString());
      const verify = vi.fn(async () => ({ state }));
      const connection = createOpenRouterConnection(createUserDataDirectory(), {
        encrypt,
        decrypt,
        verify,
      });

      await expect(connection.connect(`openrouter-${state}-key`)).resolves.toEqual({ state });
      expect(encrypt).not.toHaveBeenCalled();
      await expect(connection.getStatus()).resolves.toEqual({ state: "disconnected" });
    },
  );

  it.each(["rejected", "unavailable"] as const)(
    "reports a stored API key as %s when its verification changes",
    async (state) => {
      const encrypt = vi.fn(async (value: string) => Buffer.from(value));
      const decrypt = vi.fn(async (value: Buffer) => value.toString());
      let verification: OpenRouterVerification = {
        state: "connected",
        keyLabel: "sk-or-v1-changing...456",
      };
      const verify = vi.fn(async () => verification);
      const connection = createOpenRouterConnection(createUserDataDirectory(), {
        encrypt,
        decrypt,
        verify,
      });

      await connection.connect("openrouter-changing-key");
      verification = { state };

      await expect(connection.getStatus()).resolves.toEqual({ state });
    },
  );

  it("preserves the working connection when a replacement key is rejected", async () => {
    const encrypt = vi.fn(async (value: string) => Buffer.from(`encrypted:${value}`));
    const decrypt = vi.fn(async (value: Buffer) => value.toString().replace("encrypted:", ""));
    const verify = vi.fn(async (apiKey: string) => {
      if (apiKey === "openrouter-replacement-key") {
        return { state: "rejected" as const };
      }

      return { state: "connected" as const, keyLabel: "sk-or-v1-current...789" };
    });
    const connection = createOpenRouterConnection(createUserDataDirectory(), {
      encrypt,
      decrypt,
      verify,
    });

    await connection.connect("openrouter-current-key");
    await expect(connection.connect("openrouter-replacement-key")).resolves.toEqual({
      state: "rejected",
    });
    expect(encrypt).not.toHaveBeenCalledWith("openrouter-replacement-key");
    await expect(connection.getStatus()).resolves.toEqual({
      state: "connected",
      keyLabel: "sk-or-v1-current...789",
    });
  });

  it("preserves encryption failures without changing the connection", async () => {
    const failure = new Error("Encryption failed");
    const encrypt = vi.fn(async () => Buffer.from("encrypted"));
    encrypt.mockRejectedValueOnce(failure);
    const decrypt = vi.fn(async (value: Buffer) => value.toString());
    const verify = vi.fn(async () => ({
      state: "connected" as const,
      keyLabel: "sk-or-v1-test...012",
    }));
    const connection = createOpenRouterConnection(createUserDataDirectory(), {
      encrypt,
      decrypt,
      verify,
    });

    await expect(connection.connect("openrouter-first-key")).rejects.toBe(failure);
    await expect(connection.getStatus()).resolves.toEqual({ state: "disconnected" });
    await expect(connection.connect("openrouter-second-key")).resolves.toEqual({
      state: "connected",
      keyLabel: "sk-or-v1-test...012",
    });
  });

  it("applies connection changes in invocation order", async () => {
    let finishEncryption!: (value: Buffer) => void;
    const encryptedApiKey = new Promise<Buffer>((resolve) => {
      finishEncryption = resolve;
    });
    const encrypt = vi.fn(() => encryptedApiKey);
    const decrypt = vi.fn(async (value: Buffer) => value.toString());
    const verify = vi.fn(async () => ({
      state: "connected" as const,
      keyLabel: "sk-or-v1-ordered...345",
    }));
    const connection = createOpenRouterConnection(createUserDataDirectory(), {
      encrypt,
      decrypt,
      verify,
    });

    const connecting = connection.connect("openrouter-ordered-key");
    const disconnecting = connection.disconnect();
    finishEncryption(Buffer.from("encrypted"));

    await expect(connecting).resolves.toEqual({
      state: "connected",
      keyLabel: "sk-or-v1-ordered...345",
    });
    await expect(disconnecting).resolves.toEqual({ state: "disconnected" });
    await expect(connection.getStatus()).resolves.toEqual({ state: "disconnected" });
  });
});
