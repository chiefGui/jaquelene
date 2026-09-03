import { describe, expect, it } from "vite-plus/test";
import { countMarkdownDocument } from "./markdown-editor-statistics";

describe("Markdown document statistics", () => {
  it("counts an empty document as zero lines", () => {
    expect(countMarkdownDocument("")).toEqual({
      characters: 0,
      estimatedTokens: 0,
      lines: 0,
      words: 0,
    });
  });

  it("counts words across Markdown whitespace", () => {
    expect(countMarkdownDocument("# First line\n\nSecond\tline")).toEqual({
      characters: 25,
      estimatedTokens: 6,
      lines: 3,
      words: 4,
    });
  });

  it("counts user-perceived characters across Unicode sequences", () => {
    expect(countMarkdownDocument("Cafe\u0301 👨‍👩‍👧‍👦")).toEqual({
      characters: 6,
      estimatedTokens: 9,
      lines: 1,
      words: 1,
    });
  });
});
