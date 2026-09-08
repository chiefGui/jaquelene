import { createContext, useContext, type Provider } from "react";
import type { MarkdownStatistic } from "./markdown-editor-statistics";

export type MarkdownEditorSettings = Readonly<{
  maxRows: number;
  statistics: readonly MarkdownStatistic[];
}>;

const SettingsContext = createContext<MarkdownEditorSettings | null>(null);

export const MarkdownEditorSettingsProvider: Provider<MarkdownEditorSettings> =
  SettingsContext.Provider;

export function useMarkdownEditorSettings() {
  const settings = useContext(SettingsContext);
  if (!settings) {
    throw new Error("Markdown editors require MarkdownEditorSettingsProvider.");
  }
  return settings;
}
