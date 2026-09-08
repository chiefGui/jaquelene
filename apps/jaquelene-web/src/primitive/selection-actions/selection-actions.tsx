import { Popover, PopoverAnchor, usePopoverStore } from "@ariakit/react/popover";
import { VisuallyHidden } from "@ariakit/react/visually-hidden";
import { colors, radii, shadows } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  clippingAncestors,
  readSelection,
  selectionAnchor,
  visibleSelectionAnchor,
  type SelectedText,
} from "./selection";
import { createSelectionSession } from "./selection-session";

type SelectionActionsProps = {
  children: ReactNode;
  label: string;
  actions: (selection: { text: string; dismiss: () => void }) => ReactNode;
};

export function SelectionActions({ children, label, actions }: SelectionActionsProps) {
  const [session] = useState(createSelectionSession<SelectedText>);
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const scopeRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const clipsRef = useRef<Element[]>([]);
  const helpId = useId();
  const dismiss = useCallback(() => {
    const scope = scopeRef.current;
    if (scope && popupRef.current?.contains(scope.ownerDocument.activeElement)) {
      scope.focus({ preventScroll: true });
    }
    session.dismiss();
  }, [session]);
  const popover = usePopoverStore({
    open: snapshot !== null,
    setOpen(open) {
      if (!open) dismiss();
    },
    placement: "top",
  });

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    const doc = scope.ownerDocument;
    const win = doc.defaultView;
    if (!win) return;
    const clips = clippingAncestors(scope);
    clipsRef.current = clips;
    let frame = 0;
    let pointerSelecting = false;

    function insidePopup(target: EventTarget | null) {
      return target instanceof win!.Node && !!popupRef.current?.contains(target);
    }

    function read() {
      frame = 0;
      if (!doc.hasFocus() || pointerSelecting || insidePopup(doc.activeElement)) return;
      const next = readSelection(scope!);
      if (next) {
        if (!visibleSelectionAnchor(next, scope!, clips)) {
          session.update(next);
          session.dismiss();
          return;
        }
      }
      session.finish(next);
      popover.render();
    }

    function scheduleRead() {
      win!.cancelAnimationFrame(frame);
      frame = win!.requestAnimationFrame(read);
    }

    function onPointerDown(event: PointerEvent) {
      if (insidePopup(event.target)) return;
      if (
        event.button === 0 &&
        event.target instanceof win!.Node &&
        scope!.contains(event.target)
      ) {
        pointerSelecting = true;
        session.begin();
      } else {
        session.dismiss();
      }
    }

    function onPointerUp() {
      if (!pointerSelecting) return;
      pointerSelecting = false;
      scheduleRead();
    }

    function focusActions() {
      popupRef.current
        ?.querySelector<HTMLElement>("button:not(:disabled), [href], [tabindex='0']")
        ?.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (insidePopup(event.target)) return;
      if (
        event.target === scope &&
        !event.altKey &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "a"
      ) {
        event.preventDefault();
        doc.getSelection()?.selectAllChildren(scope!);
        return;
      }
      if (event.key === "F10" && event.altKey && session.getSnapshot()) {
        event.preventDefault();
        focusActions();
      }
    }

    function onBlur() {
      win!.cancelAnimationFrame(frame);
      pointerSelecting = false;
      session.finish(null);
    }

    doc.addEventListener("selectionchange", scheduleRead);
    doc.addEventListener("pointerdown", onPointerDown);
    doc.addEventListener("pointerup", onPointerUp);
    doc.addEventListener("pointercancel", onBlur);
    doc.addEventListener("keydown", onKeyDown);
    win.addEventListener("blur", onBlur);
    return () => {
      win.cancelAnimationFrame(frame);
      doc.removeEventListener("selectionchange", scheduleRead);
      doc.removeEventListener("pointerdown", onPointerDown);
      doc.removeEventListener("pointerup", onPointerUp);
      doc.removeEventListener("pointercancel", onBlur);
      doc.removeEventListener("keydown", onKeyDown);
      win.removeEventListener("blur", onBlur);
    };
  }, [popover, session]);

  return (
    <>
      <PopoverAnchor
        store={popover}
        ref={scopeRef}
        render={<div />}
        data-selection-actions-scope=""
        tabIndex={0}
        role="region"
        aria-label={label}
        aria-describedby={helpId}
        aria-keyshortcuts="Alt+F10"
        {...stylex.props(styles.scope)}
      >
        {children}
      </PopoverAnchor>
      <VisuallyHidden id={helpId}>
        Select text or use Select All in this region, then press Alt+F10 for selection actions.
      </VisuallyHidden>
      {snapshot && (
        <Popover
          store={popover}
          ref={popupRef}
          portal
          fixed
          modal={false}
          role="group"
          aria-label="Selection actions"
          autoFocusOnShow={false}
          finalFocus={scopeRef}
          getAnchorRect={() => selectionAnchor(snapshot.selection)}
          updatePosition={async ({ updatePosition }) => {
            const scope = scopeRef.current;
            const active = session.getSnapshot();
            if (!scope || !active) return;
            if (!visibleSelectionAnchor(active.selection, scope, clipsRef.current)) {
              dismiss();
              return;
            }
            await updatePosition();
          }}
          gutter={8}
          overflowPadding={8}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && event.button === 0) event.preventDefault();
          }}
          {...stylex.props(styles.popup)}
        >
          <div key={snapshot.id} {...stylex.props(styles.actions)}>
            {actions({ text: snapshot.selection.text, dismiss })}
          </div>
        </Popover>
      )}
    </>
  );
}

const styles = stylex.create({
  scope: {
    outlineColor: colors.focusRing,
    outlineOffset: 4,
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 1,
  },
  popup: {
    backgroundColor: colors.backgroundSurfaceOverlay,
    borderColor: colors.borderOverlay,
    borderRadius: radii.full,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: shadows.floating,
    color: colors.foregroundPrimary,
    padding: "0.25rem",
    maxWidth: "calc(100vw - 1rem)",
    zIndex: 50,
  },
  actions: { display: "flex", alignItems: "center", gap: "0.25rem" },
});
