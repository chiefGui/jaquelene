import { describe, expect, it } from "vite-plus/test";
import { countMarkdownDocument } from "./markdown-editor-statistics";

describe("Markdown document statistics", () => {
  it("counts an empty document as one line", () => {
    expect(countMarkdownDocument("")).toEqual({ characters: 0, lines: 1, words: 0 });
  });

  it("counts words across Markdown whitespace", () => {
    expect(countMarkdownDocument("# First line\n\nSecond\tline")).toEqual({
      characters: 25,
      lines: 3,
      words: 5,
    });
  });

  it("counts Unicode code points rather than UTF-16 units", () => {
    expect(countMarkdownDocument("Hi 👋")).toEqual({ characters: 4, lines: 1, words: 2 });
  });
});
