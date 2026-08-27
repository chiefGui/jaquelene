import { join } from "node:path";
import Store, { type Schema } from "electron-store";

type OpenRouterConfigurationData = {
  encryptedApiKey?: string;
};

const storeName = "openrouter";

const schema = {
  encryptedApiKey: { type: "string", minLength: 1 },
} satisfies Schema<OpenRouterConfigurationData>;

export function getOpenRouterConfigurationStoragePaths(userDataDirectory: string) {
  return [join(userDataDirectory, `${storeName}.json`)] as const;
}

export function createOpenRouterConfiguration(
  userDataDirectory: string,
  encrypt: (value: string) => Promise<Buffer>,
) {
  const store = new Store<OpenRouterConfigurationData>({
    cwd: userDataDirectory,
    name: storeName,
    schema,
    rootSchema: { additionalProperties: false },
  });
  let pendingMutation = Promise.resolve();

  function getStatus() {
    return { configured: store.has("encryptedApiKey") };
  }

  function mutate(operation: () => Promise<void> | void) {
    const result = pendingMutation.then(operation);
    pendingMutation = result.catch(() => undefined);
    return result.then(getStatus);
  }

  return {
    getStatus,

    configure(value: string) {
      const apiKey = value.trim();

      if (!apiKey) {
        throw new TypeError("OpenRouter API key must contain text.");
      }

      return mutate(async () => {
        const encryptedApiKey = await encrypt(apiKey);
        store.set("encryptedApiKey", encryptedApiKey.toString("base64"));
      });
    },

    clear() {
      return mutate(() => store.delete("encryptedApiKey"));
    },
  };
}

export type OpenRouterConfiguration = ReturnType<typeof createOpenRouterConfiguration>;
