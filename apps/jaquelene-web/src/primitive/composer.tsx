import ArrowUp02Icon from "@hugeicons/core-free-icons/ArrowUp02Icon";
import Loading02Icon from "@hugeicons/core-free-icons/Loading02Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, type ButtonProps } from "@jaquelene/ui";
import { useReducedMotion } from "@jaquelene/ui/motion";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

function ComposerRoot({ style, ...props }: StyleableProps<ComponentProps<"form">>) {
  return <form {...props} {...stylex.props(styles.root, style, stylex.defaultMarker())} />;
}

function ComposerLabel({ style, ...props }: StyleableProps<ComponentProps<"label">>) {
  return <label {...props} {...stylex.props(styles.label, style, stylex.defaultMarker())} />;
}

function ComposerInput({
  enterKeyHint = "send",
  placeholder = "Write a message…",
  rows = 2,
  style,
  ...props
}: StyleableProps<ComponentProps<"textarea">>) {
  return (
    <textarea
      {...props}
      enterKeyHint={enterKeyHint}
      placeholder={placeholder}
      rows={rows}
      {...stylex.props(styles.input, style, stylex.defaultMarker())}
    />
  );
}

function ComposerFooter({ style, ...props }: StyleableProps<ComponentProps<"div">>) {
  return <div {...props} {...stylex.props(styles.footer, style, stylex.defaultMarker())} />;
}

function ComposerControls({ style, ...props }: StyleableProps<ComponentProps<"div">>) {
  return <div {...props} {...stylex.props(styles.controls, style, stylex.defaultMarker())} />;
}

function ComposerStatus({
  style,
  tone = "muted",
  ...props
}: StyleableProps<ComponentProps<"p">> & { tone?: "danger" | "muted" }) {
  return (
    <p
      {...props}
      {...stylex.props(
        styles.status,
        tone === "danger" && styles.dangerStatus,
        style,
        stylex.defaultMarker(),
      )}
    />
  );
}

function ComposerSubmit({
  "aria-label": ariaLabel,
  disabled,
  pending = false,
  style,
  ...props
}: Omit<ButtonProps, "children" | "type"> & { pending?: boolean }) {
  const reducedMotion = useReducedMotion();

  return (
    <Button
      {...props}
      type="submit"
      aria-busy={pending || undefined}
      aria-label={ariaLabel ?? (pending ? "Generating reply" : "Send message")}
      disabled={pending || disabled === true}
      style={[styles.submit, style]}
    >
      <HugeiconsIcon
        icon={pending ? Loading02Icon : ArrowUp02Icon}
        size={17}
        strokeWidth={1.8}
        aria-hidden="true"
        {...stylex.props(pending && !reducedMotion && styles.spinning)}
      />
    </Button>
  );
}

export const Composer = Object.assign(ComposerRoot, {
  Label: ComposerLabel,
  Input: ComposerInput,
  Footer: ComposerFooter,
  Controls: ComposerControls,
  Status: ComposerStatus,
  Submit: ComposerSubmit,
});

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
  label: {
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
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
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    minHeight: tokens.controlHeight,
    paddingLeft: "0.625rem",
  },
  controls: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: "0.5rem",
    minWidth: 0,
  },
  status: {
    color: tokens.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
  dangerStatus: {
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
});
