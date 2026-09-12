import type { TextSelection } from "./selection-session";

export type SelectedText = TextSelection & {
  range: Range;
  focusRange: Range;
  backward: boolean;
};

function isEditable(node: Node) {
  let element: Element | null = node.parentElement;
  if (node.nodeType === 1) element = node as Element;
  return !!element?.closest("input, textarea, [contenteditable]:not([contenteditable='false'])");
}

export function readSelection(scope: HTMLElement): SelectedText | null {
  const selection = scope.ownerDocument.getSelection();
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
  if (!anchorNode || !focusNode) return null;
  if (!scope.contains(anchorNode) || !scope.contains(focusNode)) return null;
  if (isEditable(anchorNode) || isEditable(focusNode)) return null;
  const text = selection.toString();
  if (!text.length) return null;
  const range = selection.getRangeAt(0).cloneRange();
  const focusRange = scope.ownerDocument.createRange();
  focusRange.setStart(focusNode, focusOffset);
  focusRange.collapse(true);
  return {
    text,
    anchorNode,
    anchorOffset,
    focusNode,
    focusOffset,
    range,
    focusRange,
    backward: range.startContainer === focusNode && range.startOffset === focusOffset,
  };
}

export type Rectangle = Readonly<{ top: number; right: number; bottom: number; left: number }>;

export function isAnchorVisible(anchor: Rectangle, clips: readonly Rectangle[]) {
  let { top, right, bottom, left } = anchor;
  for (const clip of clips) {
    if (clip.bottom <= clip.top || clip.right <= clip.left) return false;
    top = Math.max(top, clip.top);
    right = Math.min(right, clip.right);
    bottom = Math.min(bottom, clip.bottom);
    left = Math.max(left, clip.left);
  }
  return bottom > top && right >= left;
}

export function selectionAnchor(selection: SelectedText): DOMRect | null {
  if (!selection.range.commonAncestorContainer.isConnected) return null;
  const caret = selection.focusRange.getBoundingClientRect();
  if (caret.height > 0) return caret;
  const lines = selection.range.getClientRects();
  if (selection.backward) return lines[0] ?? null;
  return lines[lines.length - 1] ?? null;
}

export function clippingAncestors(scope: HTMLElement): Element[] {
  const ancestors: Element[] = [];
  const win = scope.ownerDocument.defaultView;
  if (!win) return ancestors;
  for (let element: Element | null = scope; element; element = element.parentElement) {
    const style = win.getComputedStyle(element);
    if (/(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`)) {
      ancestors.push(element);
    }
  }
  return ancestors;
}

export function visibleSelectionAnchor(
  selection: SelectedText,
  scope: HTMLElement,
  clips: Element[],
) {
  const win = scope.ownerDocument.defaultView;
  if (!win) return null;
  const anchor = selectionAnchor(selection);
  if (!anchor) return null;
  const rectangles: Rectangle[] = [
    { top: 0, left: 0, bottom: win.innerHeight, right: win.innerWidth },
    ...clips.map((element) => element.getBoundingClientRect()),
  ];
  if (!isAnchorVisible(anchor, rectangles)) return null;
  return anchor;
}
