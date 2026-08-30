import * as stylex from "@stylexjs/stylex";
import { useRef, type ReactElement, type ReactNode } from "react";
import { tokens } from "../theme.stylex";
import { Button } from "./button";
import { Dialog, type DialogProps } from "./dialog";

export type ConfirmDialogProps = {
  confirmLabel: ReactNode;
  description: ReactNode;
  error?: ReactNode;
  finalFocus?: DialogProps["finalFocus"];
  heading: ReactNode;
  onConfirm: () => void;
  open: boolean;
  pending?: boolean;
  setOpen: (open: boolean) => void;
  trigger: ReactElement | null;
};

export function ConfirmDialog({
  confirmLabel,
  description,
  error,
  finalFocus,
  heading,
  onConfirm,
  open,
  pending = false,
  setOpen,
  trigger,
}: ConfirmDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);

  return (
    <Dialog.Root open={open} setOpen={setOpen}>
      {trigger ? <Dialog.Trigger render={trigger} /> : null}

      <Dialog.Content
        role="alertdialog"
        aria-busy={pending || undefined}
        initialFocus={cancelButton}
        hideOnEscape={!pending}
        hideOnInteractOutside={false}
        {...(finalFocus === undefined ? {} : { finalFocus })}
      >
        <Dialog.Heading {...stylex.props(styles.heading)}>{heading}</Dialog.Heading>
        <Dialog.Description {...stylex.props(styles.description)}>{description}</Dialog.Description>

        {error ? (
          <p role="alert" {...stylex.props(styles.error)}>
            {error}
          </p>
        ) : null}

        <div {...stylex.props(styles.actions)}>
          <Dialog.Dismiss disabled={pending} render={<Button ref={cancelButton} variant="ghost" />}>
            Cancel
          </Dialog.Dismiss>
          <Button type="button" variant="soft" tone="danger" disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

const styles = stylex.create({
  heading: {
    fontSize: tokens.fontSizeLarge,
    fontWeight: 600,
    lineHeight: tokens.lineHeightLarge,
    textBox: "trim-both text",
  },
  description: {
    color: tokens.muted,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.75rem",
  },
  error: {
    color: tokens.danger,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.75rem",
  },
  actions: {
    display: "flex",
    gap: "0.5rem",
    justifyContent: "flex-end",
    marginTop: "1.25rem",
  },
});
