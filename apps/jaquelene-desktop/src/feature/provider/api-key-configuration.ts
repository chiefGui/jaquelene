import type {
  ApiKeyProviderConfigurationSnapshot,
  ProviderConfigurationAdapter,
  ProviderConfigureResult,
} from "@jaquelene/backend";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import Store, { type Schema } from "electron-store";
import { deleteStoreFile } from "@/storage/delete-store-file";

type StoredApiKeyCredential = {
  encryptedApiKey: string;
  keyLabel?: string;
  revision: string;
};

type StoredApiKeyConnection = {
  credential?: StoredApiKeyCredential;
};

export type ApiKeyConfigurationDependencies = {
  encrypt: (value: string) => Promise<Buffer>;
  decrypt: (value: Buffer) => Promise<string>;
  verify: (apiKey: string, signal: AbortSignal) => Promise<ProviderConfigureResult>;
};

export type ApiKeyConfiguration = Extract<ProviderConfigurationAdapter, { kind: "api-key" }> & {
  withApiKey: <Result>(use: (apiKey: string) => Promise<Result>) => Promise<Result>;
};

const schema = {
  credential: {
    type: "object",
    additionalProperties: false,
    properties: {
      encryptedApiKey: { type: "string", minLength: 1 },
      keyLabel: { type: "string", minLength: 1 },
      revision: { type: "string", minLength: 1 },
    },
    required: ["encryptedApiKey", "revision"],
  },
} satisfies Schema<StoredApiKeyConnection>;

export function getApiKeyConfigurationStoragePaths(userDataDirectory: string, providerId: string) {
  return [join(userDataDirectory, `${providerId}.json`)] as const;
}

export function createApiKeyConfiguration(
  userDataDirectory: string,
  provider: Readonly<{ id: string; name: string }>,
  { encrypt, decrypt, verify }: ApiKeyConfigurationDependencies,
): ApiKeyConfiguration {
  const store = new Store<StoredApiKeyConnection>({
    clearInvalidConfig: true,
    cwd: userDataDirectory,
    name: provider.id,
    schema,
    rootSchema: { additionalProperties: false },
  });

  function inspect(): ApiKeyProviderConfigurationSnapshot {
    const credential = store.get("credential");

    if (!credential) {
      return { state: "unconfigured" };
    }

    return {
      state: "configured",
      revision: credential.revision,
      ...(credential.keyLabel ? { keyLabel: credential.keyLabel } : {}),
    };
  }

  async function readApiKey() {
    const credential = store.get("credential");

    if (!credential) {
      return undefined;
    }

    return decrypt(Buffer.from(credential.encryptedApiKey, "base64"));
  }

  return {
    kind: "api-key",
    inspect,
    storagePaths: getApiKeyConfigurationStoragePaths(userDataDirectory, provider.id),

    async withApiKey<Result>(use: (apiKey: string) => Promise<Result>) {
      const apiKey = await readApiKey();

      if (apiKey === undefined) {
        throw new Error(`${provider.name} is not connected.`);
      }

      return use(apiKey);
    },

    async configure(value: string, signal: AbortSignal) {
      const apiKey = value.trim();

      if (!apiKey) {
        throw new TypeError(`${provider.name} API key must contain text.`);
      }

      signal.throwIfAborted();
      const verification = await verify(apiKey, signal);

      if (verification.state !== "configured") {
        return verification;
      }

      signal.throwIfAborted();
      const encryptedApiKey = await encrypt(apiKey);
      signal.throwIfAborted();
      store.set("credential", {
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
