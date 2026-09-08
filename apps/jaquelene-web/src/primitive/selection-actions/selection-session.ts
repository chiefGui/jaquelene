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
  let dismissed: Selection | null = null;
  let selecting = false;
  let revision = 0;
  let snapshot: Readonly<{ id: number; selection: Selection }> | null = null;
  const listeners = new Set<() => void>();

  function publish() {
    if (selecting || !current || sameSelection(current, dismissed)) {
      if (!snapshot) return;
      snapshot = null;
    } else {
      if (snapshot?.selection === current) return;
      snapshot = { id: ++revision, selection: current };
    }
    for (const listener of listeners) listener();
  }

  function update(next: Selection | null) {
    if (!sameSelection(current, next)) {
      current = next;
      dismissed = null;
    }
    publish();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update,
    begin() {
      selecting = true;
      dismissed = null;
      publish();
    },
    finish(next: Selection | null) {
      selecting = false;
      update(next);
    },
    dismiss() {
      dismissed = current;
      publish();
    },
  };
}
