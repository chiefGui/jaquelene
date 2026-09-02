import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";
import { markdownEditorLanguage } from "./markdown-editor-language";

function syntax(value: string) {
  const state = EditorState.create({
    doc: value,
    extensions: markdownEditorLanguage,
  });

  return syntaxTree(state).toString();
}

describe("Markdown editor language", () => {
  it("recognizes the supported extended syntax", () => {
    expect(syntax("~~removed~~")).toContain("Strikethrough");
    expect(syntax("- [x] complete")).toContain("TaskMarker");
    expect(syntax("| A | B |\n| - | - |\n| 1 | 2 |")).toContain("Table");
  });

  it("does not advertise automatic links", () => {
    expect(syntax("https://example.com")).not.toContain("Autolink");
  });
});
