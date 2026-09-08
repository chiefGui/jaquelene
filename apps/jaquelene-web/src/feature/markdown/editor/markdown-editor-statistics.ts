import { estimateTokenCount } from "tokenx";

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });

function countCharacters(value: string) {
  let characters = 0;
  for (const _segment of graphemeSegmenter.segment(value)) {
    characters += 1;
  }
  return characters;
}

function countLines(value: string) {
  if (value.length === 0) {
    return 0;
  }
  let lines = 1;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 10) {
      lines += 1;
    }
  }
  return lines;
}

function countWords(value: string) {
  let words = 0;
  for (const segment of wordSegmenter.segment(value)) {
    if (segment.isWordLike) {
      words += 1;
    }
  }
  return words;
}

const counters = {
  lines: countLines,
  words: countWords,
  characters: countCharacters,
  estimatedTokens: estimateTokenCount,
};

export type MarkdownStatistic = keyof typeof counters;
export type MarkdownStatisticResult = Readonly<{ id: MarkdownStatistic; count: number }>;

export function countMarkdownDocument(
  value: string,
  metrics: readonly MarkdownStatistic[],
): readonly MarkdownStatisticResult[] {
  return metrics.map((id) => ({ id, count: counters[id](value) }));
}
