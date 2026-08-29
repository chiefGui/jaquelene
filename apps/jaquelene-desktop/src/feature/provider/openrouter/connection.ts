import { join } from "node:path";
import Store, { type Schema } from "electron-store";
import type { OpenRouterVerification } from "./verification";

type StoredOpenRouterCredential = {
  encryptedApiKey?: string;
  keyLabel?: string;
};

export type OpenRouterConnectResult = OpenRouterVerification;

type OpenRouterConnectionDependencies = {
  encrypt: (value: string) => Promise<Buffer>;
  decrypt: (value: Buffer) => Promise<string>;
  verify: (apiKey: string) => Promise<OpenRouterConnectResult>;
};

export type OpenRouterConfiguration =
  | { state: "disconnected" }
  | { state: "configured"; keyLabel?: string };

const storeName = "openrouter";

const schema = {
  encryptedApiKey: { type: "string", minLength: 1 },
  keyLabel: { type: "string", minLength: 1 },
} satisfies Schema<StoredOpenRouterCredential>;

export function getOpenRouterConnectionStoragePaths(userDataDirectory: string) {
  return [join(userDataDirectory, `${storeName}.json`)] as const;
}

export function createOpenRouterConnection(
  userDataDirectory: string,
  { encrypt, decrypt, verify }: OpenRouterConnectionDependencies,
) {
  const store = new Store<StoredOpenRouterCredential>({
    clearInvalidConfig: true,
    cwd: userDataDirectory,
    name: storeName,
    schema,
    rootSchema: { additionalProperties: false },
  });

  let pendingMutation: Promise<unknown> = Promise.resolve();

  function getConfiguration(): OpenRouterConfiguration {
    if (!store.has("encryptedApiKey")) {
      return { state: "disconnected" };
    }

    const keyLabel = store.get("keyLabel");
    return {
      state: "configured",
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

  function mutate<Result>(operation: () => Promise<Result> | Result) {
    const result = pendingMutation.then(operation);
    pendingMutation = result.catch(() => undefined);
    return result;
  }

  return {
    getConfiguration,

    async withApiKey<Result>(use: (apiKey: string) => Promise<Result>) {
      const apiKey = await readApiKey();

      if (apiKey === undefined) {
        throw new Error("OpenRouter is not connected.");
      }

      return use(apiKey);
    },

    connect(value: string) {
      const apiKey = value.trim();

      if (!apiKey) {
        throw new TypeError("OpenRouter API key must contain text.");
      }

      return mutate(async () => {
        const verification = await verify(apiKey);

        if (verification.state !== "connected") {
          return verification;
        }

        const encryptedApiKey = await encrypt(apiKey);
        store.set({
          encryptedApiKey: encryptedApiKey.toString("base64"),
          keyLabel: verification.keyLabel,
        });
        return verification;
      });
    },

    disconnect() {
      return mutate(() => store.clear());
    },
  };
}

export type OpenRouterConnection = ReturnType<typeof createOpenRouterConnection>;
