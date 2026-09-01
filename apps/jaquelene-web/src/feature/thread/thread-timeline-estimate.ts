const estimatedCharactersPerLine = 32;
const estimatedLineHeight = 20;
const estimatedMessageChrome = 42;
const estimatedReplyStateHeight = 22;

function estimateVisualLineCount(content: string) {
  let lineCount = 0;
  let lineCodeUnits = 0;

  for (let index = 0; index < content.length; index += 1) {
    const codeUnit = content.charCodeAt(index);

    if (codeUnit !== 10 && codeUnit !== 13) {
      lineCodeUnits += 1;
      continue;
    }

    lineCount += Math.max(1, Math.ceil(lineCodeUnits / estimatedCharactersPerLine));
    lineCodeUnits = 0;

    if (codeUnit === 13 && content.charCodeAt(index + 1) === 10) {
      index += 1;
    }
  }

  return lineCount + Math.max(1, Math.ceil(lineCodeUnits / estimatedCharactersPerLine));
}

export function estimateThreadTimelineItemSize(content: string, hasReplyState: boolean) {
  return (
    estimateVisualLineCount(content) * estimatedLineHeight +
    estimatedMessageChrome +
    (hasReplyState ? estimatedReplyStateHeight : 0)
  );
}
