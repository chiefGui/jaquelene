import { history } from "@codemirror/commands";
import {
  Annotation,
  EditorSelection,
  Transaction,
  type ChangeSpec,
  type Compartment,
  type EditorState,
} from "@codemirror/state";

export const externalDocument = Annotation.define<boolean>();

export function synchronizeMarkdownDocument(
  state: EditorState,
  value: string,
  historyCompartment: Compartment,
  resetHistory: boolean,
): readonly Transaction[] {
  const annotations = [externalDocument.of(true), Transaction.addToHistory.of(false)];
  let changes: ChangeSpec = [];
  if (state.doc.toString() !== value) {
    changes = { from: 0, to: state.doc.length, insert: value };
  }
  if (!resetHistory) {
    return [state.update({ annotations, changes })];
  }

  // Removing and restoring the history extension clears its state without
  // remounting the editor, moving focus, or replacing unrelated extensions.
  const cleared = state.update({
    annotations,
    changes,
    selection: EditorSelection.create(
      state.selection.ranges.map((range) =>
        EditorSelection.range(
          Math.min(range.anchor, value.length),
          Math.min(range.head, value.length),
        ),
      ),
      state.selection.mainIndex,
    ),
    effects: historyCompartment.reconfigure([]),
  });
  const restored = cleared.state.update({
    annotations,
    effects: historyCompartment.reconfigure(history()),
  });
  return [cleared, restored];
}
