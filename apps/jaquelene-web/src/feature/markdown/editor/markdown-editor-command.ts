import { EditorSelection, type StateCommand } from "@codemirror/state";

export type MarkdownEditorCommand = "code" | "emphasis" | "link" | "strong";

function splitBoundaryWhitespace(value: string, emptySelectionText: string) {
  if (!value) {
    return { content: emptySelectionText, leading: "", trailing: "" };
  }

  const leading = value.match(/^\s+/u)?.[0] ?? "";

  if (leading.length === value.length) {
    return { content: value, leading: "", trailing: "" };
  }

  const withoutLeading = value.slice(leading.length);
  const trailing = withoutLeading.match(/\s+$/u)?.[0] ?? "";
  const content = withoutLeading.slice(0, withoutLeading.length - trailing.length);

  return { content, leading, trailing };
}

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
      const { content, leading, trailing } = splitBoundaryWhitespace(
        selectedText,
        emptySelectionText,
      );
      const contentFrom = selection.from + leading.length + opening.length;

      return {
        changes: {
          from: selection.from,
          to: selection.to,
          insert: `${leading}${opening}${content}${closing}${trailing}`,
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

function needsInlineCodePadding(value: string) {
  const preservesEdgeWhitespace =
    value.startsWith(" ") && value.endsWith(" ") && value.trim().length > 0;

  return value.startsWith("`") || value.endsWith("`") || preservesEdgeWhitespace;
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
    const padding = needsInlineCodePadding(content) ? " " : "";
    const contentFrom = selection.from + marker.length + padding.length;

    return {
      changes: {
        from: selection.from,
        to: selection.to,
        insert: `${marker}${padding}${content}${padding}${marker}`,
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
    const {
      content: label,
      leading,
      trailing,
    } = splitBoundaryWhitespace(selectedText, "link text");
    const destination = "https://";
    const insert = `${leading}[${label}](${destination})${trailing}`;
    const selectingDestination = selectedText.length > 0;
    const selectedFrom = selectingDestination
      ? selection.from + leading.length + label.length + 3
      : selection.from + leading.length + 1;
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
