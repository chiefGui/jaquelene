import { EditorState, type StateCommand } from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";
import { markdownEditorCommands } from "./markdown-editor-command";

function runCommand(
  command: StateCommand,
  document: string,
  selection: { anchor: number; head?: number },
) {
  const state = EditorState.create({ doc: document, selection });
  let nextState = state;
  const handled = command({
    state,
    dispatch: (transaction) => {
      nextState = transaction.state;
    },
  });

  return {
    document: nextState.doc.toString(),
    handled,
    selection: nextState.selection.main,
  };
}

describe("Markdown editor commands", () => {
  it("wraps selected text with strong emphasis", () => {
    const result = runCommand(markdownEditorCommands.strong, "Keep this vivid.", {
      anchor: 5,
      head: 9,
    });

    expect(result.document).toBe("Keep **this** vivid.");
    expect(result.selection.from).toBe(7);
    expect(result.selection.to).toBe(11);
  });

  it("keeps boundary whitespace outside emphasis markers", () => {
    const result = runCommand(markdownEditorCommands.strong, "Make this vivid now.", {
      anchor: 4,
      head: 16,
    });

    expect(result.document).toBe("Make **this vivid** now.");
    expect(result.selection.from).toBe(7);
    expect(result.selection.to).toBe(17);
  });

  it("inserts editable placeholder text for an empty selection", () => {
    const result = runCommand(markdownEditorCommands.emphasis, "Write ", { anchor: 6 });

    expect(result.document).toBe("Write _emphasized text_");
    expect(result.selection.from).toBe(7);
    expect(result.selection.to).toBe(22);
  });

  it("chooses a safe inline-code delimiter", () => {
    const result = runCommand(markdownEditorCommands.code, "Use a `literal` value.", {
      anchor: 4,
      head: 15,
    });

    expect(result.document).toBe("Use `` a `literal` `` value.");
    expect(result.selection.from).toBe(7);
    expect(result.selection.to).toBe(18);
  });

  it("preserves meaningful whitespace at inline-code boundaries", () => {
    const result = runCommand(markdownEditorCommands.code, " spaced ", {
      anchor: 0,
      head: 8,
    });

    expect(result.document).toBe("`  spaced  `");
    expect(result.selection.from).toBe(2);
    expect(result.selection.to).toBe(10);
  });

  it("selects the destination when linking selected text", () => {
    const result = runCommand(markdownEditorCommands.link, "Visit Jaquelene now.", {
      anchor: 5,
      head: 16,
    });

    expect(result.document).toBe("Visit [Jaquelene](https://) now.");
    expect(result.selection.from).toBe(18);
    expect(result.selection.to).toBe(26);
  });

  it("does not edit read-only state", () => {
    const state = EditorState.create({
      doc: "Unchanged",
      extensions: EditorState.readOnly.of(true),
    });
    let dispatched = false;

    expect(
      markdownEditorCommands.strong({
        state,
        dispatch: () => {
          dispatched = true;
        },
      }),
    ).toBe(false);
    expect(dispatched).toBe(false);
  });
});
