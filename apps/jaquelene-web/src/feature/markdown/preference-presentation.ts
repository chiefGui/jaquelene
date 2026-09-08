import {
  MarkdownEditorMaxRows,
  type MarkdownEditorPreferenceValues,
} from "@jaquelene/ipc/renderer";
import type { MarkdownEditorSettings } from "./editor/markdown-editor-settings";
import type { MarkdownStatistic } from "./editor/markdown-editor-statistics";

export type MarkdownStatisticPreferenceKey = Exclude<
  keyof MarkdownEditorPreferenceValues,
  "maxRows"
>;

export const statisticPreferences = [
  { key: "showLineCount", metric: "lines", label: "Show line count" },
  { key: "showWordCount", metric: "words", label: "Show word count" },
  { key: "showCharacterCount", metric: "characters", label: "Show character count" },
  { key: "showEstimatedTokens", metric: "estimatedTokens", label: "Show estimated tokens" },
] as const satisfies readonly {
  key: MarkdownStatisticPreferenceKey;
  metric: MarkdownStatistic;
  label: string;
}[];

const rowCounts = {
  [MarkdownEditorMaxRows.Five]: 5,
  [MarkdownEditorMaxRows.Six]: 6,
  [MarkdownEditorMaxRows.Seven]: 7,
  [MarkdownEditorMaxRows.Eight]: 8,
  [MarkdownEditorMaxRows.Nine]: 9,
  [MarkdownEditorMaxRows.Ten]: 10,
} satisfies Record<MarkdownEditorMaxRows, number>;

export const markdownEditorRowOptions = Object.values(MarkdownEditorMaxRows).map((value) => ({
  value,
  label: value,
}));

export function presentMarkdownEditorSettings(
  values: MarkdownEditorPreferenceValues,
): MarkdownEditorSettings {
  return {
    maxRows: rowCounts[values.maxRows],
    statistics: statisticPreferences.filter(({ key }) => values[key]).map(({ metric }) => metric),
  };
}
