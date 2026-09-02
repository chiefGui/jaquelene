const whitespace = /\s/u;

export type MarkdownDocumentStatistics = Readonly<{
  characters: number;
  lines: number;
  words: number;
}>;

export function countMarkdownDocument(value: string): MarkdownDocumentStatistics {
  let characters = 0;
  let lines = 1;
  let words = 0;
  let insideWord = false;

  for (const character of value) {
    characters += 1;

    if (character === "\n") {
      lines += 1;
    }

    const nextInsideWord = !whitespace.test(character);

    if (nextInsideWord && !insideWord) {
      words += 1;
    }

    insideWord = nextInsideWord;
  }

  return { characters, lines, words };
}
