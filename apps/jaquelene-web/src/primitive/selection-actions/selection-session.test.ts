import { describe, expect, it, vi } from "vite-plus/test";
import { createSelectionSession, type TextSelection } from "./selection-session";

function selection(overrides: Partial<TextSelection> = {}): TextSelection {
  return {
    text: "Selected text",
    anchorNode: {},
    anchorOffset: 0,
    focusNode: {},
    focusOffset: 13,
    ...overrides,
  };
}

describe("selection action sessions", () => {
  it("opens for keyboard selection and closes when selection is cleared", () => {
    const session = createSelectionSession();
    const selected = selection();
    session.update(selected);
    expect(session.getSnapshot()?.selection).toBe(selected);
    session.update(null);
    expect(session.getSnapshot()).toBeNull();
  });

  it("waits until dragging finishes, publishing the final selection only", () => {
    const session = createSelectionSession();
    const initial = selection();
    const final = selection({ text: "A longer selection" });
    session.begin();
    session.update(initial);
    expect(session.getSnapshot()).toBeNull();
    session.finish(final);
    expect(session.getSnapshot()?.selection).toBe(final);
  });

  it("keeps Escape and completed actions dismissed until the selection changes", () => {
    const session = createSelectionSession();
    const selected = selection();
    session.update(selected);
    session.dismiss();
    session.update({ ...selected });
    expect(session.getSnapshot()).toBeNull();
    session.update({ ...selected, focusOffset: 14, text: "Selected text!" });
    expect(session.getSnapshot()?.selection.text).toBe("Selected text!");
  });

  it("reopens the same text after a new selection gesture with a fresh action state", () => {
    const session = createSelectionSession();
    const selected = selection();
    session.update(selected);
    const originalId = session.getSnapshot()?.id;
    session.dismiss();
    session.begin();
    session.finish({ ...selected });
    expect(session.getSnapshot()?.selection.text).toBe(selected.text);
    expect(session.getSnapshot()?.id).not.toBe(originalId);
  });

  it("distinguishes identical text selected at different positions", () => {
    const session = createSelectionSession();
    const selected = selection();
    session.update(selected);
    session.dismiss();
    session.update({ ...selected, anchorOffset: 20, focusOffset: 33 });
    expect(session.getSnapshot()).not.toBeNull();
  });

  it("does not republish unchanged selection and releases subscribers", () => {
    const session = createSelectionSession();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    const selected = selection();
    session.update(selected);
    const original = session.getSnapshot();
    session.update({ ...selected });
    expect(session.getSnapshot()).toBe(original);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    session.dismiss();
    expect(listener).toHaveBeenCalledOnce();
  });
});
