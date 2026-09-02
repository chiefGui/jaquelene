import {
  Dialog as AriakitDialog,
  DialogDescription,
  DialogDisclosure,
  DialogDismiss,
  DialogHeading,
  DialogProvider,
  useDialogContext,
  type DialogProps as AriakitDialogProps,
} from "@ariakit/react/dialog";
import { useStoreState } from "@ariakit/react/store";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import * as m from "motion/react-m";

import { colors, tokens } from "../tokens.stylex";
import { MotionPresence, overlayTransition } from "./motion";

export type DialogProps = Omit<
  AriakitDialogProps,
  | "alwaysVisible"
  | "aria-modal"
  | "backdrop"
  | "className"
  | "modal"
  | "onClose"
  | "open"
  | "portal"
  | "preventBodyScroll"
  | "render"
  | "store"
  | "style"
  | "unmountOnHide"
> & {
  style?: StyleXStyles;
};

function DialogContent({ style, ...props }: DialogProps) {
  const dialog = useDialogContext();
  const mounted = useStoreState(dialog, "mounted") ?? false;

  if (!dialog) {
    throw new Error("Dialog.Content must be used inside Dialog.Root.");
  }

  return (
    <MotionPresence present={mounted}>
      <AriakitDialog
        {...props}
        store={dialog}
        modal
        portal
        alwaysVisible
        aria-modal="true"
        backdrop={
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={overlayTransition}
            {...stylex.props(styles.backdrop)}
          />
        }
        render={
          <m.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={overlayTransition}
            {...stylex.props(styles.content, style)}
          />
        }
      />
    </MotionPresence>
  );
}

export const Dialog = {
  Root: DialogProvider,
  Trigger: DialogDisclosure,
  Content: DialogContent,
  Heading: DialogHeading,
  Description: DialogDescription,
  Dismiss: DialogDismiss,
} as const;

const styles = stylex.create({
  backdrop: {
    backgroundColor: colors.backgroundOverlay,
  },
  content: {
    backgroundColor: colors.backgroundFloating,
    borderColor: colors.borderDefault,
    borderRadius: tokens.radiusXLarge,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowXLarge,
    color: colors.foregroundPrimary,
    height: "fit-content",
    inset: 0,
    margin: "auto",
    maxHeight: "calc(var(--dialog-viewport-height, 100dvh) - 2rem)",
    maxWidth: "calc(100vw - 2rem)",
    outline: "none",
    overflowY: "auto",
    padding: "1rem",
    position: "fixed",
    width: "24rem",
    zIndex: 100,
  },
});
