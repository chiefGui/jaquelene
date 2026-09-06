import {
  REGENERATION_INSTRUCTIONS_MAX_LENGTH,
  parseRegenerationInstructions,
  regenerationInstructionsSchema,
} from "@jaquelene/domain";
import { Button, Field, Textarea } from "@jaquelene/ui";
import { Dialog } from "@jaquelene/ui/dialog";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useId, useRef, useState, type ReactElement } from "react";

export function RegenerateResponseDialog({
  open,
  setOpen,
  trigger,
  pending,
  disabled,
  requestFailed,
  savedInstructions,
  previousAttemptFailed,
  onRegenerate,
}: Readonly<{
  open: boolean;
  setOpen: (open: boolean) => void;
  trigger: ReactElement;
  pending: boolean;
  disabled: boolean;
  requestFailed: boolean;
  savedInstructions: string | undefined;
  previousAttemptFailed: boolean;
  onRegenerate: (instructions?: string) => void;
}>) {
  const [instructions, setInstructions] = useState("");
  const inputId = useId();
  const statusId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const valid = regenerationInstructionsSchema.safeParse(instructions).success;
  let error = "";
  if (!valid) {
    error = `Use ${REGENERATION_INSTRUCTIONS_MAX_LENGTH.toLocaleString("en-US")} characters or fewer.`;
  } else if (requestFailed) {
    error = "Couldn't start regeneration. Try again.";
  }

  function changeOpen(nextOpen: boolean) {
    if (pending) {
      return;
    }

    if (nextOpen) {
      let initialInstructions = "";
      if (previousAttemptFailed) {
        initialInstructions = savedInstructions ?? "";
      }
      setInstructions(initialInstructions);
    }

    setOpen(nextOpen);
  }

  return (
    <Dialog.Root open={open} setOpen={changeOpen}>
      <Dialog.Trigger render={trigger} />
      <Dialog.Content
        style={styles.dialog}
        initialFocus={input}
        aria-busy={pending || undefined}
        hideOnEscape={!pending}
        hideOnInteractOutside={false}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !disabled) {
              onRegenerate(parseRegenerationInstructions(instructions));
            }
          }}
        >
          <Dialog.Heading {...stylex.props(styles.heading)}>Regenerate response</Dialog.Heading>
          <Dialog.Description {...stylex.props(styles.description)}>
            Uses the current settings and may incur provider usage.
          </Dialog.Description>

          <Field.Root style={styles.field}>
            <Field.Label htmlFor={inputId}>Instructions (optional)</Field.Label>
            <Textarea
              ref={input}
              id={inputId}
              value={instructions}
              readOnly={pending}
              aria-invalid={!valid || undefined}
              aria-describedby={statusId}
              placeholder="Make it more ominous, or shorten the second paragraph…"
              onChange={(event) => setInstructions(event.currentTarget.value)}
              style={styles.input}
            />
          </Field.Root>

          {savedInstructions && !previousAttemptFailed && (
            <details {...stylex.props(styles.previous)}>
              <summary>Previous instructions</summary>
              <p {...stylex.props(styles.previousText)}>{savedInstructions}</p>
              <Button
                type="button"
                variant="ghost"
                size="small"
                disabled={pending}
                onClick={() => {
                  setInstructions(savedInstructions);
                  input.current?.focus();
                }}
              >
                Use instructions
              </Button>
            </details>
          )}

          <p id={statusId} role="alert" {...stylex.props(styles.status)}>
            {error}
          </p>
          <div {...stylex.props(styles.actions)}>
            <Dialog.Dismiss disabled={pending} render={<Button type="button" variant="ghost" />}>
              Cancel
            </Dialog.Dismiss>
            <Button type="submit" disabled={disabled || !valid}>
              Regenerate
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}

const styles = stylex.create({
  dialog: { width: "32rem" },
  heading: {
    fontSize: tokens.fontSizeLarge,
    fontWeight: 600,
    lineHeight: tokens.lineHeightLarge,
    textBox: "trim-both text",
  },
  description: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.75rem",
  },
  field: { marginTop: "1.25rem" },
  input: { resize: "none" },
  previous: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.75rem",
  },
  previousText: {
    marginBlock: "0.5rem",
    maxHeight: "8rem",
    overflowY: "auto",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  status: {
    color: colors.foregroundDanger,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.5rem",
    minHeight: tokens.lineHeightSmall,
  },
  actions: {
    display: "flex",
    gap: "0.25rem",
    justifyContent: "flex-end",
    marginTop: "0.75rem",
  },
});
