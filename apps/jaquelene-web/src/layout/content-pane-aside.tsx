import {
  Dialog,
  DialogDisclosure,
  useDialogStore,
  type DialogProps,
  type DialogStore,
} from "@ariakit/react/dialog";
import { Role, type RoleProps } from "@ariakit/react/role";
import { useStoreState } from "@ariakit/react/store";
import PanelRightCloseIcon from "@hugeicons/core-free-icons/PanelRightCloseIcon";
import PanelRightOpenIcon from "@hugeicons/core-free-icons/PanelRightOpenIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconButton } from "@jaquelene/ui";
import { colors } from "@jaquelene/ui/tokens.stylex";
import { Tooltip } from "@jaquelene/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import {
  Activity,
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { contentPaneLayout, shellLayout } from "./layout-tokens.stylex";

const OverlayContext = createContext<boolean | null>(null);
const AsideContext = createContext<DialogStore | null>(null);
// Reserve 36rem for the conversation alongside the 20rem inspector.
const minimumDockedWidthRem = 56;

type AsidePartProps = Omit<RoleProps<"div">, "className" | "style"> & {
  style?: StyleXStyles;
};

export function ContentPaneAsideProvider({ children }: { children: ReactNode }) {
  const dialog = useDialogStore();
  return <AsideContext.Provider value={dialog}>{children}</AsideContext.Provider>;
}

function useAsideStore() {
  const dialog = useContext(AsideContext);
  if (!dialog) throw new Error("Content-pane inspector parts require ContentPane.Root.");
  return dialog;
}

export function ContentPaneSplit({ children }: { children: ReactNode }) {
  const dialog = useAsideStore();
  const open = useStoreState(dialog, "open");
  const ref = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState(true);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    function measure() {
      if (!element) return;
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      setOverlay(element.clientWidth < minimumDockedWidthRem * rem);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <OverlayContext.Provider value={overlay}>
      <div ref={ref} {...stylex.props(styles.split, open && styles.withAside)}>
        {children}
      </div>
    </OverlayContext.Provider>
  );
}

export function ContentPaneAsideToggle({ label }: { label: string }) {
  const dialog = useAsideStore();
  const open = useStoreState(dialog, "open");
  let action = `Show ${label}`;
  let icon = PanelRightOpenIcon;
  if (open) {
    action = `Hide ${label}`;
    icon = PanelRightCloseIcon;
  }

  return (
    <Tooltip.Root placement="bottom-end">
      <DialogDisclosure
        store={dialog}
        render={
          <Tooltip.Anchor
            render={
              <IconButton.Root aria-label={action} style={[styles.toggle, open && styles.active]}>
                <IconButton.Icon render={<HugeiconsIcon icon={icon} />} />
              </IconButton.Root>
            }
          />
        }
      />
      <Tooltip>{action}</Tooltip>
    </Tooltip.Root>
  );
}

export function ContentPaneAside({
  children,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  "aria-label": string;
}) {
  const dialog = useAsideStore();
  const open = useStoreState(dialog, "open");
  const overlay = useContext(OverlayContext);
  const ref = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [hasOpened, setHasOpened] = useState(false);

  useLayoutEffect(() => {
    if (!open || !overlay) return;
    // Resizing must not leave keyboard focus behind the newly overlaid panel.
    // An open dialog (including a nested picker) already owns its focus.
    if (document.activeElement?.closest("[data-dialog][data-open]")) return;
    ref.current?.focus({ preventScroll: true });
  }, [open, overlay]);

  if (open && !hasOpened) setHasOpened(true);
  if (overlay === null) throw new Error("ContentPane.Aside requires ContentPane.Split.");

  let mode: "hidden" | "visible" = "hidden";
  if (open) mode = "visible";
  let backdrop: DialogProps["backdrop"] = false;
  let placement: StyleXStyles = styles.docked;
  if (overlay) {
    placement = styles.overlay;
    // Override Ariakit's inline fixed positioning to contain the scrim in this pane.
    backdrop = (
      <div ref={backdropRef} {...stylex.props(styles.backdrop)} style={{ position: "absolute" }} />
    );
  }

  return (
    <Dialog
      store={dialog}
      ref={ref}
      aria-label={ariaLabel}
      modal={false}
      portal={false}
      backdrop={backdrop}
      preventBodyScroll={false}
      // Navigation leaves the preference intact; only the owned scrim dismisses it.
      hideOnInteractOutside={(event) => event.target === backdropRef.current}
      initialFocus={ref}
      {...stylex.props(styles.aside, placement)}
    >
      {hasOpened && <Activity mode={mode}>{children}</Activity>}
    </Dialog>
  );
}

export function ContentPaneAsideViewport({ style, ...props }: AsidePartProps) {
  return <Role.div {...props} {...stylex.props(styles.viewport, style)} />;
}

export function ContentPaneAsideBody({ style, ...props }: AsidePartProps) {
  return <Role.div {...props} {...stylex.props(styles.body, style)} />;
}

export function ContentPaneAsideFooter({ style, ...props }: AsidePartProps) {
  return <Role.div {...props} {...stylex.props(styles.footer, style)} />;
}

const styles = stylex.create({
  split: {
    display: "grid",
    flex: 1,
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gridTemplateRows: `${shellLayout.headerHeight} minmax(0, 1fr)`,
    isolation: "isolate",
    minHeight: 0,
    minWidth: 0,
    position: "relative",
  },
  withAside: {
    [contentPaneLayout.headerInsetEnd]: `min(100%, ${contentPaneLayout.asideWidth})`,
  },
  aside: {
    backgroundColor: colors.backgroundSurface,
    borderInlineStartColor: colors.borderSubtle,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    maxWidth: "100%",
    minHeight: 0,
    outline: "none",
    overflow: "hidden",
    // The pane's persistent header and toggle occupy the shared first grid row.
    paddingBlockStart: shellLayout.headerHeight,
    width: contentPaneLayout.asideWidth,
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    overscrollBehavior: "contain",
  },
  body: {
    borderBlockStartColor: colors.borderSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: {
      default: 0,
      ":not(:first-child)": 1,
    },
    margin: 0,
    minWidth: 0,
    padding: "1.25rem",
  },
  footer: {
    alignItems: "center",
    borderBlockStartColor: colors.borderSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    display: "flex",
    flexShrink: 0,
    gap: "0.5rem",
    justifyContent: "space-between",
    padding: "0.75rem",
  },
  docked: {
    gridColumn: "2",
    gridRow: "1 / -1",
  },
  overlay: {
    insetBlock: 0,
    insetInlineEnd: 0,
    position: "absolute",
    zIndex: 2,
  },
  backdrop: {
    backgroundColor: colors.backgroundScrim,
    inset: 0,
    position: "absolute",
    zIndex: 1,
  },
  toggle: {
    // Keep the disclosure above the inspector while the header sits under the scrim.
    position: "relative",
    zIndex: 3,
  },
  active: {
    backgroundColor: colors.backgroundNeutralSubtle,
    color: colors.foregroundPrimary,
  },
});
