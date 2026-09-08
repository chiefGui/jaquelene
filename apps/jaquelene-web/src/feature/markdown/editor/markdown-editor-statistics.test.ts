import { describe, expect, it, vi, afterEach } from "vite-plus/test";
import { estimateTokenCount } from "tokenx";
import { countMarkdownDocument, type MarkdownStatistic } from "./markdown-editor-statistics";

vi.mock("tokenx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("tokenx")>();
  return { ...actual, estimateTokenCount: vi.fn(actual.estimateTokenCount) };
});

const metrics: readonly MarkdownStatistic[] = ["lines", "words", "characters", "estimatedTokens"];

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("Markdown document statistics", () => {
  it("counts an empty document as zero lines", () => {
    expect(countMarkdownDocument("", metrics)).toEqual([
      { id: "lines", count: 0 },
      { id: "words", count: 0 },
      { id: "characters", count: 0 },
      { id: "estimatedTokens", count: 0 },
    ]);
  });

  it("counts words across Markdown whitespace", () => {
    expect(countMarkdownDocument("# First line\n\nSecond\tline", metrics)).toEqual([
      { id: "lines", count: 3 },
      { id: "words", count: 4 },
      { id: "characters", count: 25 },
      { id: "estimatedTokens", count: 6 },
    ]);
  });

  it.each(Array.from({ length: 16 }, (_, mask) => mask))(
    "counts Unicode text using exactly the enabled metrics for selection %i",
    (mask) => {
      const selected = metrics.filter((_metric, index) => (mask & (1 << index)) !== 0);
      const expected = { lines: 1, words: 1, characters: 6, estimatedTokens: 9 };
      const segment = vi.spyOn(Intl.Segmenter.prototype, "segment");
      expect(countMarkdownDocument("Cafe\u0301 👨‍👩‍👧‍👦", selected)).toEqual(
        selected.map((id) => ({ id, count: expected[id] })),
      );
      expect(estimateTokenCount).toHaveBeenCalledTimes(
        Number(selected.includes("estimatedTokens")),
      );
      expect(segment).toHaveBeenCalledTimes(
        Number(selected.includes("words")) + Number(selected.includes("characters")),
      );
    },
  );

  it("preserves the requested metric order", () => {
    expect(countMarkdownDocument("One\nTwo", ["characters", "lines"])).toEqual([
      { id: "characters", count: 7 },
      { id: "lines", count: 2 },
    ]);
  });
});
