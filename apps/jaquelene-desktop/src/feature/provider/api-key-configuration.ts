import type {
  ApiKeyProviderConfigurationSnapshot,
  ProviderConfigurationAdapter,
} from "@jaquelene/backend";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import Store, { type Schema } from "electron-store";
import { deleteStoreFile } from "@/storage/delete-store-file";

type StoredApiKeyCredential = {
  encryptedApiKey: string;
  keyLabel: string;
  revision: string;
};

type StoredApiKeyConnection = {
  credential?: StoredApiKeyCredential;
};

export type ApiKeyVerificationResult =
  | Readonly<{ state: "configured"; keyLabel?: string }>
  | Readonly<{ state: "rejected" }>
  | Readonly<{ state: "unavailable" }>;

export type ApiKeyConfigurationDependencies = {
  encrypt: (value: string) => Promise<Buffer>;
  decrypt: (value: Buffer) => Promise<string>;
  verify: (apiKey: string, signal: AbortSignal) => Promise<ApiKeyVerificationResult>;
};

export type ApiKeyConfiguration = Extract<ProviderConfigurationAdapter, { kind: "api-key" }> & {
  withApiKey: <Result>(use: (apiKey: string) => Promise<Result>) => Promise<Result>;
};

type ApiKeyProvider = Readonly<{
  id: string;
  name: string;
  apiKeyPrefixes: readonly string[];
}>;

const opaqueApiKeyLabel = "••••";
const visibleSuffixLength = 4;
const minimumHiddenLength = 8;

const schema = {
  credential: {
    type: "object",
    additionalProperties: false,
    properties: {
      encryptedApiKey: { type: "string", minLength: 1 },
      keyLabel: { type: "string", minLength: 1 },
      revision: { type: "string", minLength: 1 },
    },
    required: ["encryptedApiKey", "keyLabel", "revision"],
  },
} satisfies Schema<StoredApiKeyConnection>;

export function getApiKeyConfigurationStoragePaths(userDataDirectory: string, providerId: string) {
  return [join(userDataDirectory, `${providerId}.json`)] as const;
}

export function createApiKeyConfiguration(
  userDataDirectory: string,
  provider: ApiKeyProvider,
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
      keyLabel: credential.keyLabel,
    };
  }

  function redactApiKey(apiKey: string) {
    if (apiKey.length < visibleSuffixLength + minimumHiddenLength) {
      return opaqueApiKeyLabel;
    }

    const prefix = provider.apiKeyPrefixes.find(
      (candidate) =>
        apiKey.startsWith(candidate) &&
        apiKey.length - candidate.length >= visibleSuffixLength + minimumHiddenLength,
    );
    return `${prefix ?? ""}...${apiKey.slice(-visibleSuffixLength)}`;
  }

  function resolveKeyLabel(apiKey: string, candidate: string | undefined) {
    if (candidate === undefined) {
      return redactApiKey(apiKey);
    }

    const label = candidate.trim();

    if (!label || label.includes(apiKey)) {
      throw new TypeError(`${provider.name} returned an unsafe API-key label.`);
    }

    return label;
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

      const label = resolveKeyLabel(apiKey, verification.keyLabel);
      signal.throwIfAborted();
      const encryptedApiKey = await encrypt(apiKey);
      signal.throwIfAborted();
      store.set("credential", {
        encryptedApiKey: encryptedApiKey.toString("base64"),
        revision: randomUUID(),
        keyLabel: label,
      });
      return { state: "configured", keyLabel: label };
    },

    async clear() {
      deleteStoreFile(store);
    },
  };
}
