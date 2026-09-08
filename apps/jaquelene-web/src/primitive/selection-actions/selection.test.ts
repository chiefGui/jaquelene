import { describe, expect, it } from "vite-plus/test";
import { isAnchorVisible, readSelection } from "./selection";

function selectionSource() {
  const anchor = { nodeType: 3, parentElement: { closest: () => null } };
  const focus = { nodeType: 3, parentElement: { closest: () => null } };
  const range = {
    startContainer: anchor,
    startOffset: 0,
    cloneRange() {
      return { ...this };
    },
  };
  const selection = {
    rangeCount: 1,
    isCollapsed: false,
    anchorNode: anchor as object,
    anchorOffset: 0,
    focusNode: focus as object,
    focusOffset: 5,
    toString: () => "  one\n\ttwo  ",
    getRangeAt: () => range,
  };
  const scope = {
    contains: (node: object) => node === anchor || node === focus,
    ownerDocument: {
      getSelection: () => selection,
      createRange: () => ({ setStart() {}, collapse() {} }),
    },
  };
  return { scope: scope as unknown as HTMLElement, selection, anchor, focus, range };
}

describe("reading a scoped text selection", () => {
  it("captures exact plain text across nodes without changing whitespace", () => {
    const { scope } = selectionSource();
    expect(readSelection(scope)?.text).toBe("  one\n\ttwo  ");
  });

  it("rejects a selection extending outside the region", () => {
    const { scope, selection } = selectionSource();
    selection.focusNode = {};
    expect(readSelection(scope)).toBeNull();
  });

  it("rejects a selection starting outside the region", () => {
    const { scope, selection } = selectionSource();
    selection.anchorNode = {};
    expect(readSelection(scope)).toBeNull();
  });

  it("leaves editable selections to their own controls", () => {
    const { scope, anchor } = selectionSource();
    Object.assign(anchor.parentElement, { closest: () => ({ tagName: "TEXTAREA" }) });
    expect(readSelection(scope)).toBeNull();
  });

  it("does not offer actions for a caret or multiple ranges", () => {
    const { scope, selection } = selectionSource();
    selection.isCollapsed = true;
    expect(readSelection(scope)).toBeNull();
    selection.isCollapsed = false;
    selection.rangeCount = 2;
    expect(readSelection(scope)).toBeNull();
  });

  it("identifies the active end when selecting backward", () => {
    const { scope, selection, anchor, focus } = selectionSource();
    selection.anchorNode = focus;
    selection.anchorOffset = 5;
    selection.focusNode = anchor;
    selection.focusOffset = 0;
    expect(readSelection(scope)?.backward).toBe(true);
  });
});

describe("selection anchor visibility", () => {
  const viewport = { left: 0, top: 0, right: 800, bottom: 600 };
  const pane = { left: 200, top: 80, right: 700, bottom: 500 };

  it("accepts a zero-width caret inside the transcript pane", () => {
    expect(
      isAnchorVisible({ left: 300, right: 300, top: 100, bottom: 120 }, [viewport, pane]),
    ).toBe(true);
  });

  it("hides selections scrolled out of a clipping ancestor even inside the window", () => {
    expect(isAnchorVisible({ left: 300, right: 300, top: 40, bottom: 60 }, [viewport, pane])).toBe(
      false,
    );
  });

  it("keeps partially visible lines available", () => {
    expect(isAnchorVisible({ left: 300, right: 300, top: 70, bottom: 90 }, [viewport, pane])).toBe(
      true,
    );
  });

  it("rejects missing geometry and horizontally clipped selections", () => {
    expect(isAnchorVisible({ left: 0, right: 0, top: 0, bottom: 0 }, [viewport])).toBe(false);
    expect(
      isAnchorVisible({ left: 750, right: 750, top: 100, bottom: 120 }, [viewport, pane]),
    ).toBe(false);
  });

  it("requires overlap with the intersection of all clipping ancestors", () => {
    const nestedPane = { left: 200, right: 700, top: 510, bottom: 600 };
    expect(
      isAnchorVisible({ left: 300, right: 300, top: 450, bottom: 550 }, [
        viewport,
        pane,
        nestedPane,
      ]),
    ).toBe(false);
  });
});
