import { estimateTokenCount } from "tokenx";

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });

export type MarkdownDocumentStatistics = Readonly<{
  characters: number;
  estimatedTokens: number;
  lines: number;
  words: number;
}>;

export function countMarkdownDocument(value: string): MarkdownDocumentStatistics {
  let characters = 0;
  let lines = value.length === 0 ? 0 : 1;
  let words = 0;

  for (const _segment of graphemeSegmenter.segment(value)) {
    characters += 1;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 10) {
      lines += 1;
    }
  }

  for (const segment of wordSegmenter.segment(value)) {
    if (segment.isWordLike) {
      words += 1;
    }
  }

  return { characters, estimatedTokens: estimateTokenCount(value), lines, words };
}
