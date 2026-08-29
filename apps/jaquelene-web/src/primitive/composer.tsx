import ArrowUp02Icon from "@hugeicons/core-free-icons/ArrowUp02Icon";
import Loading02Icon from "@hugeicons/core-free-icons/Loading02Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@jaquelene/ui";
import { useReducedMotion } from "@jaquelene/ui/motion";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useId, type FormEventHandler, type KeyboardEventHandler, type ReactNode } from "react";

type ComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  maxLength: number;
  submitDisabled: boolean;
  pending: boolean;
  guidance?: ReactNode;
  error?: ReactNode;
};

export function Composer({
  value,
  onValueChange,
  onSubmit,
  onKeyDown,
  maxLength,
  submitDisabled,
  pending,
  guidance,
  error,
}: ComposerProps) {
  const reducedMotion = useReducedMotion();
  const inputId = useId();
  const guidanceId = useId();
  const errorId = useId();
  const description = [guidance ? guidanceId : null, error ? errorId : null]
    .filter((id) => id !== null)
    .join(" ");

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.root)}>
      <label htmlFor={inputId} {...stylex.props(styles.visuallyHidden)}>
        Message
      </label>
      <textarea
        id={inputId}
        value={value}
        rows={2}
        maxLength={maxLength}
        placeholder="Write a message…"
        aria-describedby={description || undefined}
        enterKeyHint="send"
        onChange={(event) => onValueChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        {...stylex.props(styles.input)}
      />
      <div {...stylex.props(styles.footer)}>
        <div {...stylex.props(styles.messages)}>
          {guidance ? (
            <p id={guidanceId} {...stylex.props(styles.message)}>
              {guidance}
            </p>
          ) : null}
          {error ? (
            <p id={errorId} role="alert" {...stylex.props(styles.message, styles.dangerMessage)}>
              {error}
            </p>
          ) : null}
        </div>
        <Button
          type="submit"
          disabled={submitDisabled}
          aria-busy={pending || undefined}
          aria-label={pending ? "Generating reply" : "Send message"}
          style={styles.submit}
        >
          <HugeiconsIcon
            icon={pending ? Loading02Icon : ArrowUp02Icon}
            size={17}
            strokeWidth={1.8}
            aria-hidden="true"
            {...stylex.props(pending && !reducedMotion && styles.spinning)}
          />
        </Button>
      </div>
    </form>
  );
}

const spin = stylex.keyframes({
  to: {
    transform: "rotate(360deg)",
  },
});

const styles = stylex.create({
  root: {
    backgroundColor: tokens.surfaceRaised,
    borderColor: {
      default: `color-mix(in oklab, ${tokens.foreground} 9%, transparent)`,
      ":focus-within": `color-mix(in oklab, ${tokens.accent} 38%, transparent)`,
    },
    borderRadius: tokens.radiusXLarge,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowLarge,
    display: "flex",
    flexDirection: "column",
    padding: "0.375rem",
  },
  input: {
    appearance: "none",
    backgroundColor: "transparent",
    borderWidth: 0,
    caretColor: tokens.accent,
    color: tokens.foreground,
    fieldSizing: "content",
    fontFamily: "inherit",
    fontSize: tokens.fontSizeBase,
    lineHeight: tokens.lineHeightBase,
    maxHeight: "12rem",
    minHeight: "3.75rem",
    outline: "none",
    overflowY: "auto",
    paddingBlock: "0.625rem",
    paddingInline: "0.625rem",
    resize: "none",
    width: "100%",
    "::placeholder": {
      color: tokens.muted,
    },
  },
  footer: {
    alignItems: "flex-end",
    display: "flex",
    gap: "0.75rem",
    minHeight: tokens.controlHeight,
    paddingLeft: "0.625rem",
  },
  messages: {
    alignSelf: "center",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "0.125rem",
    minWidth: 0,
  },
  message: {
    color: tokens.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
  dangerMessage: {
    color: tokens.danger,
  },
  submit: {
    borderRadius: "9999px",
    paddingInline: 0,
    width: tokens.controlHeight,
  },
  spinning: {
    animationDuration: "0.8s",
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },
  visuallyHidden: {
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
});
