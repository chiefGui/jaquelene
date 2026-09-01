const estimatedCharactersPerLine = 32;
const estimatedLineHeight = 20;
const estimatedParagraphGap = 10;
const estimatedMessageChrome = 42;
const estimatedReplyStateHeight = 22;

function estimateContentHeight(content: string) {
  let height = 0;
  let hasRenderedLine = false;
  let paragraphGapPending = false;
  let lineHasContent = false;
  let lineCodeUnits = 0;

  for (let index = 0; index < content.length; index += 1) {
    const codeUnit = content.charCodeAt(index);

    if (codeUnit !== 10 && codeUnit !== 13) {
      lineCodeUnits += 1;
      lineHasContent ||= codeUnit !== 9 && codeUnit !== 32;
      continue;
    }

    if (lineHasContent) {
      if (paragraphGapPending) {
        height += estimatedParagraphGap;
      }

      height += Math.ceil(lineCodeUnits / estimatedCharactersPerLine) * estimatedLineHeight;
      hasRenderedLine = true;
      paragraphGapPending = false;
    } else if (hasRenderedLine) {
      paragraphGapPending = true;
    }

    lineHasContent = false;
    lineCodeUnits = 0;

    if (codeUnit === 13 && content.charCodeAt(index + 1) === 10) {
      index += 1;
    }
  }

  if (lineHasContent) {
    if (paragraphGapPending) {
      height += estimatedParagraphGap;
    }

    height += Math.ceil(lineCodeUnits / estimatedCharactersPerLine) * estimatedLineHeight;
  }

  return height || estimatedLineHeight;
}

export function estimateThreadTimelineItemSize(content: string, hasReplyState: boolean) {
  return (
    estimateContentHeight(content) +
    estimatedMessageChrome +
    (hasReplyState ? estimatedReplyStateHeight : 0)
  );
}
