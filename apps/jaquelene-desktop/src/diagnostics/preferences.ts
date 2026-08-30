import type { Schema } from "electron-store";

export type DiagnosticsPreferenceValues = {
  writeToDisk: boolean;
};

type DiagnosticsPreferencesStorage = {
  read(): DiagnosticsPreferenceValues | undefined;
  write(values: DiagnosticsPreferenceValues): void;
};

const defaultValues = {
  writeToDisk: true,
} satisfies DiagnosticsPreferenceValues;

export const diagnosticsPreferencesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    writeToDisk: { type: "boolean" },
  },
  required: ["writeToDisk"],
} satisfies Schema<{ diagnostics: DiagnosticsPreferenceValues }>["diagnostics"];

export function createDiagnosticsPreferences(storage: DiagnosticsPreferencesStorage) {
  function get(): DiagnosticsPreferenceValues {
    return { ...(storage.read() ?? defaultValues) };
  }

  return {
    get,

    setWriteToDisk(writeToDisk: boolean) {
      if (typeof writeToDisk !== "boolean") {
        throw new TypeError("The diagnostic log persistence preference must be a boolean.");
      }

      const values = { writeToDisk };
      storage.write(values);
      return { ...values };
    },
  };
}

export type DiagnosticsPreferences = ReturnType<typeof createDiagnosticsPreferences>;
