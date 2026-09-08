import { describe, expect, it } from "vite-plus/test";
import {
  createMarkdownEditorPreferences,
  markdownEditorRowOptions,
  type MarkdownEditorPreferenceValues,
} from "./preferences";

function createPreferences() {
  let stored: MarkdownEditorPreferenceValues | undefined;
  return createMarkdownEditorPreferences({
    read: () => stored,
    write: (values) => {
      stored = values;
    },
  });
}

describe("Markdown editor preferences", () => {
  it("defaults to five rows and all statistics", () => {
    expect(createPreferences().get()).toEqual({
      maxRows: 5,
      showLineCount: true,
      showWordCount: true,
      showCharacterCount: true,
      showEstimatedTokens: true,
    });
  });
  it.each(markdownEditorRowOptions)("accepts row limit %i without changing visibility", (rows) => {
    const preferences = createPreferences();
    preferences.setShowWordCount(false);
    expect(preferences.setMaxRows(rows)).toBe(rows);
    expect(preferences.get()).toMatchObject({ maxRows: rows, showWordCount: false });
  });
  it.each([4, 11, 5.5, NaN, Infinity, "5"])("rejects unsupported row limit %s", (rows) => {
    const preferences = createPreferences();
    expect(() => preferences.setMaxRows(rows as never)).toThrow(TypeError);
    expect(preferences.get().maxRows).toBe(5);
  });
  it("updates statistics independently and returns only the saved field", () => {
    const preferences = createPreferences();
    expect(preferences.setShowLineCount(false)).toBe(false);
    expect(preferences.setShowWordCount(false)).toBe(false);
    expect(preferences.setShowCharacterCount(false)).toBe(false);
    expect(preferences.setShowEstimatedTokens(false)).toBe(false);
    expect(preferences.get()).toEqual({
      maxRows: 5,
      showLineCount: false,
      showWordCount: false,
      showCharacterCount: false,
      showEstimatedTokens: false,
    });
    expect(preferences.setShowWordCount(true)).toBe(true);
    expect(preferences.get()).toMatchObject({ showWordCount: true, showLineCount: false });
  });
  it.each([
    "setShowLineCount",
    "setShowWordCount",
    "setShowCharacterCount",
    "setShowEstimatedTokens",
  ] as const)("validates %s", (setter) => {
    const preferences = createPreferences();
    expect(() => preferences[setter]("false" as never)).toThrow(TypeError);
  });
  it("does not expose mutable stored values", () => {
    const preferences = createPreferences();
    preferences.setMaxRows(8);
    const values = preferences.get();
    values.maxRows = 10;
    expect(preferences.get().maxRows).toBe(8);
  });
});
