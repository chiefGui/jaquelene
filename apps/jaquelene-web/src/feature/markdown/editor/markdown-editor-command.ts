import { EditorSelection, type StateCommand } from "@codemirror/state";

export type MarkdownEditorCommand = "code" | "emphasis" | "link" | "strong";

function surroundSelection(
  opening: string,
  closing: string,
  emptySelectionText: string,
): StateCommand {
  return ({ state, dispatch }) => {
    if (state.readOnly) {
      return false;
    }

    const transaction = state.changeByRange((selection) => {
      const selectedText = state.sliceDoc(selection.from, selection.to);
      const content = selectedText || emptySelectionText;
      const contentFrom = selection.from + opening.length;

      return {
        changes: {
          from: selection.from,
          to: selection.to,
          insert: `${opening}${content}${closing}`,
        },
        range: EditorSelection.range(contentFrom, contentFrom + content.length),
      };
    });

    dispatch(state.update(transaction, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

function longestBacktickRun(value: string) {
  let longest = 0;

  for (const match of value.matchAll(/`+/g)) {
    longest = Math.max(longest, match[0].length);
  }

  return longest;
}

const insertStrong = surroundSelection("**", "**", "strong text");
const insertEmphasis = surroundSelection("_", "_", "emphasized text");

const insertCode: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) {
    return false;
  }

  const transaction = state.changeByRange((selection) => {
    const selectedText = state.sliceDoc(selection.from, selection.to);
    const content = selectedText || "code";
    const marker = "`".repeat(longestBacktickRun(content) + 1);
    const contentFrom = selection.from + marker.length;

    return {
      changes: {
        from: selection.from,
        to: selection.to,
        insert: `${marker}${content}${marker}`,
      },
      range: EditorSelection.range(contentFrom, contentFrom + content.length),
    };
  });

  dispatch(state.update(transaction, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

const insertLink: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) {
    return false;
  }

  const transaction = state.changeByRange((selection) => {
    const selectedText = state.sliceDoc(selection.from, selection.to);
    const label = selectedText || "link text";
    const destination = "https://";
    const insert = `[${label}](${destination})`;
    const selectingDestination = selectedText.length > 0;
    const selectedFrom = selectingDestination
      ? selection.from + label.length + 3
      : selection.from + 1;
    const selectedLength = selectingDestination ? destination.length : label.length;

    return {
      changes: { from: selection.from, to: selection.to, insert },
      range: EditorSelection.range(selectedFrom, selectedFrom + selectedLength),
    };
  });

  dispatch(state.update(transaction, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

export const markdownEditorCommands = {
  code: insertCode,
  emphasis: insertEmphasis,
  link: insertLink,
  strong: insertStrong,
} satisfies Record<MarkdownEditorCommand, StateCommand>;
