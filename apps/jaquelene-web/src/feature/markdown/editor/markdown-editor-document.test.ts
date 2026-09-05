import { history, redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { Compartment, EditorState, StateField, type StateCommand } from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";
import { externalDocument, synchronizeMarkdownDocument } from "./markdown-editor-document";

function run(state: EditorState, command: StateCommand) {
  let result = state;
  command({
    state,
    dispatch: (transaction) => {
      result = transaction.state;
    },
  });
  return result;
}

function setup() {
  const compartment = new Compartment();
  const state = EditorState.create({ doc: "Original", extensions: compartment.of(history()) });
  return { compartment, state: state.update({ changes: { from: 8, insert: " edited" } }).state };
}

describe("Markdown document synchronization", () => {
  it("keeps ordinary controlled-value synchronization outside typing history", () => {
    const compartment = new Compartment();
    const state = EditorState.create({
      doc: "Original",
      extensions: compartment.of(history()),
    });
    const transactions = synchronizeMarkdownDocument(state, "External", compartment, false);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.annotation(externalDocument)).toBe(true);
    expect(transactions[0]!.state.doc.toString()).toBe("External");
    expect(undoDepth(transactions[0]!.state)).toBe(0);
  });

  it("clears undo and redo when committing the same document", () => {
    const { compartment, state } = setup();
    expect(undoDepth(state)).toBe(1);
    const committed = synchronizeMarkdownDocument(
      state,
      state.doc.toString(),
      compartment,
      true,
    ).at(-1)!.state;
    expect(undoDepth(committed)).toBe(0);
    expect(redoDepth(committed)).toBe(0);
    expect(run(committed, undo).doc.toString()).toBe("Original edited");
  });

  it("cannot restore discarded edits through keyboard redo after cancellation", () => {
    const { compartment, state } = setup();
    const undone = run(state, undo);
    expect(redoDepth(undone)).toBe(1);
    const reset = synchronizeMarkdownDocument(undone, "Original", compartment, true).at(-1)!.state;
    expect(run(reset, redo).doc.toString()).toBe("Original");
    expect(redoDepth(reset)).toBe(0);
  });

  it("starts fresh typing history when selecting another version", () => {
    const { compartment, state } = setup();
    const selected = synchronizeMarkdownDocument(state, "AI version", compartment, true).at(
      -1,
    )!.state;
    const edited = selected.update({ changes: { from: 10, insert: " edited" } }).state;
    expect(run(edited, undo).doc.toString()).toBe("AI version");
    expect(undoDepth(run(edited, undo))).toBe(0);
  });

  it("preserves selection and unrelated extension state on save", () => {
    const marker = {};
    const field = StateField.define({ create: () => marker, update: (value) => value });
    const compartment = new Compartment();
    const state = EditorState.create({
      doc: "Original",
      selection: { anchor: 2, head: 5 },
      extensions: [compartment.of(history()), field],
    });
    const committed = synchronizeMarkdownDocument(state, "Original", compartment, true).at(
      -1,
    )!.state;
    expect(committed.selection.eq(state.selection)).toBe(true);
    expect(committed.field(field)).toBe(marker);
  });

  it("clamps selection to shorter versions and marks synchronization as external", () => {
    const { compartment, state } = setup();
    const selected = state.update({ selection: { anchor: 12, head: 15 } }).state;
    const transactions = synchronizeMarkdownDocument(selected, "New", compartment, true);
    expect(transactions.at(-1)!.state.selection.main.anchor).toBe(3);
    expect(transactions.every((transaction) => transaction.annotation(externalDocument))).toBe(
      true,
    );
  });
});
