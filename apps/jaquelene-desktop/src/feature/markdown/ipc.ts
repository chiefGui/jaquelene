import {
  MarkdownEditorMaxRows as IpcMaxRows,
  MarkdownEditorPreferences as MarkdownEditorPreferencesIpc,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { MarkdownEditorMaxRows, MarkdownEditorPreferences } from "./preferences";

const rows = {
  [IpcMaxRows.Five]: 5,
  [IpcMaxRows.Six]: 6,
  [IpcMaxRows.Seven]: 7,
  [IpcMaxRows.Eight]: 8,
  [IpcMaxRows.Nine]: 9,
  [IpcMaxRows.Ten]: 10,
} as const satisfies Record<IpcMaxRows, MarkdownEditorMaxRows>;

const ipcRows = {
  5: IpcMaxRows.Five,
  6: IpcMaxRows.Six,
  7: IpcMaxRows.Seven,
  8: IpcMaxRows.Eight,
  9: IpcMaxRows.Nine,
  10: IpcMaxRows.Ten,
} satisfies Record<MarkdownEditorMaxRows, IpcMaxRows>;

export function exposeMarkdownEditorPreferences(
  target: WebFrameMain,
  preferences: MarkdownEditorPreferences,
) {
  MarkdownEditorPreferencesIpc.for(target).setImplementation({
    get() {
      const values = preferences.get();
      return { ...values, maxRows: ipcRows[values.maxRows] };
    },
    setMaxRows: (maxRows) => ipcRows[preferences.setMaxRows(rows[maxRows])],
    setShowLineCount: preferences.setShowLineCount,
    setShowWordCount: preferences.setShowWordCount,
    setShowCharacterCount: preferences.setShowCharacterCount,
    setShowEstimatedTokens: preferences.setShowEstimatedTokens,
  });
}
