import type {
  ApiKeyProviderConfigurationSnapshot,
  ProviderConfigurationAdapter,
  ProviderConfigureResult,
} from "@jaquelene/backend";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import Store, { type Schema } from "electron-store";
import { deleteStoreFile } from "@/storage/delete-store-file";
import { openRouterProviderId } from "./identity";

type StoredOpenRouterCredential = {
  encryptedApiKey?: string;
  keyLabel?: string;
  revision?: string;
};

export type OpenRouterConfigurationDependencies = {
  encrypt: (value: string) => Promise<Buffer>;
  decrypt: (value: Buffer) => Promise<string>;
  verify: (apiKey: string, signal: AbortSignal) => Promise<ProviderConfigureResult>;
};

export type OpenRouterConfiguration = Extract<ProviderConfigurationAdapter, { kind: "api-key" }> & {
  withApiKey: <Result>(use: (apiKey: string) => Promise<Result>) => Promise<Result>;
};

const storeName = openRouterProviderId;

const schema = {
  encryptedApiKey: { type: "string", minLength: 1 },
  keyLabel: { type: "string", minLength: 1 },
  revision: { type: "string", minLength: 1 },
} satisfies Schema<StoredOpenRouterCredential>;

export function getOpenRouterConnectionStoragePaths(userDataDirectory: string) {
  return [join(userDataDirectory, `${storeName}.json`)] as const;
}

export function createOpenRouterConfiguration(
  userDataDirectory: string,
  { encrypt, decrypt, verify }: OpenRouterConfigurationDependencies,
): OpenRouterConfiguration {
  const store = new Store<StoredOpenRouterCredential>({
    clearInvalidConfig: true,
    cwd: userDataDirectory,
    name: storeName,
    schema,
    rootSchema: { additionalProperties: false },
  });

  if (store.has("encryptedApiKey") && !store.has("revision")) {
    deleteStoreFile(store);
  }

  function inspect(): ApiKeyProviderConfigurationSnapshot {
    const revision = store.get("revision");

    if (!store.has("encryptedApiKey") || !revision) {
      return { state: "unconfigured" };
    }

    const keyLabel = store.get("keyLabel");
    return {
      state: "configured",
      revision,
      ...(keyLabel ? { keyLabel } : {}),
    };
  }

  async function readApiKey() {
    const encryptedApiKey = store.get("encryptedApiKey");

    if (encryptedApiKey === undefined) {
      return undefined;
    }

    return decrypt(Buffer.from(encryptedApiKey, "base64"));
  }

  return {
    kind: "api-key",
    inspect,
    storagePaths: getOpenRouterConnectionStoragePaths(userDataDirectory),

    async withApiKey<Result>(use: (apiKey: string) => Promise<Result>) {
      const apiKey = await readApiKey();

      if (apiKey === undefined) {
        throw new Error("OpenRouter is not connected.");
      }

      return use(apiKey);
    },

    async configure(value: string, signal: AbortSignal) {
      const apiKey = value.trim();

      if (!apiKey) {
        throw new TypeError("OpenRouter API key must contain text.");
      }

      signal.throwIfAborted();
      const verification = await verify(apiKey, signal);

      if (verification.state !== "configured") {
        return verification;
      }

      signal.throwIfAborted();
      const encryptedApiKey = await encrypt(apiKey);
      signal.throwIfAborted();
      store.set({
        encryptedApiKey: encryptedApiKey.toString("base64"),
        revision: randomUUID(),
        ...(verification.keyLabel ? { keyLabel: verification.keyLabel } : {}),
      });
      return verification;
    },

    async clear() {
      deleteStoreFile(store);
    },
  };
}
