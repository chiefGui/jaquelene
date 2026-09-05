import type {
  ApiKeyProviderConfigurationSnapshot,
  ProviderConfigurationAdapter,
} from "@jaquelene/backend";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import Store, { type Schema } from "electron-store";
import { Effect } from "effect";
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
  verify: (apiKey: string) => Effect.Effect<ApiKeyVerificationResult, unknown>;
};

export type ApiKeyConfiguration = Extract<ProviderConfigurationAdapter, { kind: "api-key" }> & {
  withApiKey: <Result, Error, Requirements>(
    use: (apiKey: string) => Effect.Effect<Result, Error, Requirements>,
  ) => Effect.Effect<Result, unknown, Requirements>;
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

  return {
    kind: "api-key",
    inspect,

    withApiKey: Effect.fn("ApiKeyConfiguration.withApiKey")(function* <Result, Error, Requirements>(
      use: (apiKey: string) => Effect.Effect<Result, Error, Requirements>,
    ) {
      const credential = yield* Effect.try({
        try: () => store.get("credential"),
        catch: (cause) => cause,
      });

      if (!credential) {
        return yield* Effect.fail(new Error(`${provider.name} is not connected.`));
      }

      const apiKey = yield* Effect.tryPromise({
        try: () => decrypt(Buffer.from(credential.encryptedApiKey, "base64")),
        catch: (cause) => cause,
      });
      return yield* use(apiKey);
    }),

    configure: Effect.fn("ApiKeyConfiguration.configure")(function* (value: string) {
      const apiKey = value.trim();

      if (!apiKey) {
        return yield* Effect.fail(new TypeError(`${provider.name} API key must contain text.`));
      }

      const verification = yield* verify(apiKey);

      if (verification.state !== "configured") {
        return verification;
      }

      const label = yield* Effect.try({
        try: () => resolveKeyLabel(apiKey, verification.keyLabel),
        catch: (cause) => cause,
      });
      const encryptedApiKey = yield* Effect.tryPromise({
        try: () => encrypt(apiKey),
        catch: (cause) => cause,
      });
      yield* Effect.try({
        try: () =>
          store.set("credential", {
            encryptedApiKey: encryptedApiKey.toString("base64"),
            revision: randomUUID(),
            keyLabel: label,
          }),
        catch: (cause) => cause,
      });
      return { state: "configured" as const, keyLabel: label };
    }),

    clear: Effect.try({
      try: () => deleteStoreFile(store),
      catch: (cause) => cause,
    }),
  };
}
