import { join } from "node:path";
import Store, { type Schema } from "electron-store";
import type { OpenRouterVerification } from "./verification";

type StoredOpenRouterCredential = {
  encryptedApiKey?: string;
};

type OpenRouterConnectionDependencies = {
  encrypt: (value: string) => Promise<Buffer>;
  decrypt: (value: Buffer) => Promise<string>;
  verify: (apiKey: string) => Promise<OpenRouterVerification>;
};

export type OpenRouterConnectionStatus = { state: "disconnected" } | OpenRouterVerification;

const storeName = "openrouter";

const schema = {
  encryptedApiKey: { type: "string", minLength: 1 },
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

  async function getStatus(): Promise<OpenRouterConnectionStatus> {
    const encryptedApiKey = store.get("encryptedApiKey");

    if (encryptedApiKey === undefined) {
      return { state: "disconnected" };
    }

    const apiKey = await decrypt(Buffer.from(encryptedApiKey, "base64"));
    return verify(apiKey);
  }

  function mutate<Result>(operation: () => Promise<Result> | Result) {
    const result = pendingMutation.then(operation);
    pendingMutation = result.catch(() => undefined);
    return result;
  }

  return {
    getStatus,

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
        store.set("encryptedApiKey", encryptedApiKey.toString("base64"));
        return verification;
      });
    },

    disconnect() {
      return mutate(() => {
        store.delete("encryptedApiKey");
        return { state: "disconnected" } as const;
      });
    },
  };
}

export type OpenRouterConnection = ReturnType<typeof createOpenRouterConnection>;
