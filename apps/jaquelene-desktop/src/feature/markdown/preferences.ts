import type { Schema } from "electron-store";

export const markdownEditorRowOptions = [5, 6, 7, 8, 9, 10] as const;
export type MarkdownEditorMaxRows = (typeof markdownEditorRowOptions)[number];

export type MarkdownEditorPreferenceValues = {
  maxRows: MarkdownEditorMaxRows;
  showLineCount: boolean;
  showWordCount: boolean;
  showCharacterCount: boolean;
  showEstimatedTokens: boolean;
};

type StatisticsPreference = Exclude<keyof MarkdownEditorPreferenceValues, "maxRows">;

const defaultValues: MarkdownEditorPreferenceValues = {
  maxRows: 5,
  showLineCount: true,
  showWordCount: true,
  showCharacterCount: true,
  showEstimatedTokens: true,
};

export const markdownEditorPreferencesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    maxRows: { type: "number", enum: [...markdownEditorRowOptions] },
    showLineCount: { type: "boolean" },
    showWordCount: { type: "boolean" },
    showCharacterCount: { type: "boolean" },
    showEstimatedTokens: { type: "boolean" },
  },
  required: Object.keys(defaultValues),
} satisfies Schema<{ markdownEditor: MarkdownEditorPreferenceValues }>["markdownEditor"];

export function createMarkdownEditorPreferences(storage: {
  read(): MarkdownEditorPreferenceValues | undefined;
  write(values: MarkdownEditorPreferenceValues): void;
}) {
  function get(): MarkdownEditorPreferenceValues {
    return { ...(storage.read() ?? defaultValues) };
  }

  function setStatistic(key: StatisticsPreference, visible: boolean) {
    if (typeof visible !== "boolean") {
      throw new TypeError("Markdown editor statistic visibility must be a boolean.");
    }
    storage.write({ ...get(), [key]: visible });
    return visible;
  }

  return {
    get,
    setMaxRows(maxRows: MarkdownEditorMaxRows) {
      if (!markdownEditorRowOptions.includes(maxRows)) {
        throw new TypeError(`Unsupported Markdown editor row limit "${maxRows}".`);
      }
      storage.write({ ...get(), maxRows });
      return maxRows;
    },
    setShowLineCount: (visible: boolean) => setStatistic("showLineCount", visible),
    setShowWordCount: (visible: boolean) => setStatistic("showWordCount", visible),
    setShowCharacterCount: (visible: boolean) => setStatistic("showCharacterCount", visible),
    setShowEstimatedTokens: (visible: boolean) => setStatistic("showEstimatedTokens", visible),
  };
}

export type MarkdownEditorPreferences = ReturnType<typeof createMarkdownEditorPreferences>;
