import { MarkdownEditorMaxRows } from "@jaquelene/ipc/renderer";
import { describe, expect, it } from "vite-plus/test";
import { presentMarkdownEditorSettings, markdownEditorRowOptions } from "./preference-presentation";

describe("Markdown editor settings presentation", () => {
  it.each(Object.values(MarkdownEditorMaxRows))("resolves row option %s", (maxRows) => {
    expect(
      presentMarkdownEditorSettings({
        maxRows,
        showLineCount: true,
        showWordCount: true,
        showCharacterCount: true,
        showEstimatedTokens: true,
      }),
    ).toEqual({
      maxRows: Number(maxRows),
      statistics: ["lines", "words", "characters", "estimatedTokens"],
    });
  });
  it("offers precisely the fixed row choices", () => {
    expect(markdownEditorRowOptions.map(({ label }) => label)).toEqual([
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
  });
  it.each(Array.from({ length: 16 }, (_, mask) => mask))(
    "resolves visibility selection %i",
    (mask) => {
      const settings = presentMarkdownEditorSettings({
        maxRows: MarkdownEditorMaxRows.Five,
        showLineCount: (mask & 1) !== 0,
        showWordCount: (mask & 2) !== 0,
        showCharacterCount: (mask & 4) !== 0,
        showEstimatedTokens: (mask & 8) !== 0,
      });
      expect(settings.statistics).toEqual(
        ["lines", "words", "characters", "estimatedTokens"].filter(
          (_metric, index) => (mask & (1 << index)) !== 0,
        ),
      );
    },
  );
});
