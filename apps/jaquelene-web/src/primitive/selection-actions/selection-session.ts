export type TextSelection = Readonly<{
  text: string;
  anchorNode: object;
  anchorOffset: number;
  focusNode: object;
  focusOffset: number;
}>;

function sameSelection(left: TextSelection | null, right: TextSelection | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.text === right.text &&
    left.anchorNode === right.anchorNode &&
    left.anchorOffset === right.anchorOffset &&
    left.focusNode === right.focusNode &&
    left.focusOffset === right.focusOffset
  );
}

export function createSelectionSession<Selection extends TextSelection>() {
  let current: Selection | null = null;
  let dismissed = false;
  let revision = 0;
  let snapshot: Readonly<{ id: number; selection: Selection }> | null = null;
  const listeners = new Set<() => void>();

  function publish(selection: Selection | null) {
    if (!selection) {
      if (!snapshot) return;
      snapshot = null;
    } else {
      if (snapshot?.selection === selection) return;
      snapshot = { id: ++revision, selection };
    }
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin() {
      dismissed = false;
      publish(null);
    },
    finish(next: Selection | null) {
      if (!sameSelection(current, next)) {
        current = next;
        dismissed = false;
      }
      if (!dismissed) publish(current);
    },
    dismiss() {
      dismissed = true;
      publish(null);
    },
  };
}
