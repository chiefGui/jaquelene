import {
  Button as AriakitButton,
  type ButtonProps as AriakitButtonProps,
} from "@ariakit/react/button";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { colors, tokens } from "../tokens.stylex";

export type SwitchProps = Omit<
  AriakitButtonProps,
  "aria-checked" | "children" | "className" | "onClick" | "role" | "style"
> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  style?: StyleXStyles;
};

export function Switch({ checked, onCheckedChange, style, ...props }: SwitchProps) {
  return (
    <AriakitButton
      {...props}
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      {...stylex.props(styles.root, style)}
    >
      <span {...stylex.props(styles.track, checked && styles.trackChecked)}>
        <span {...stylex.props(styles.thumb, checked && styles.thumbChecked)} />
      </span>
    </AriakitButton>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: tokens.radiusMedium,
    display: "inline-flex",
    flexShrink: 0,
    height: tokens.controlHeight,
    justifyContent: "center",
    opacity: {
      default: 1,
      ":disabled": 0.5,
      ':is([aria-disabled="true"])': 0.5,
    },
    outline: "none",
    padding: 0,
    width: "2.5rem",
  },
  track: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.surfaceRaisedBorder,
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    display: "block",
    height: "1.125rem",
    outlineColor: {
      default: null,
      [stylex.when.ancestor("[data-focus-visible]")]:
        `color-mix(in oklch, ${colors.accent} 70%, transparent)`,
    },
    outlineOffset: {
      default: null,
      [stylex.when.ancestor("[data-focus-visible]")]: 2,
    },
    outlineStyle: {
      default: "none",
      [stylex.when.ancestor("[data-focus-visible]")]: "solid",
    },
    outlineWidth: {
      default: null,
      [stylex.when.ancestor("[data-focus-visible]")]: 2,
    },
    padding: "0.0625rem",
    width: "2rem",
  },
  trackChecked: {
    backgroundColor: `color-mix(in oklch, ${colors.accent} 72%, ${colors.canvas})`,
    borderColor: `color-mix(in oklch, ${colors.accent} 65%, ${colors.surfaceRaisedBorder})`,
  },
  thumb: {
    backgroundColor: colors.foreground,
    borderRadius: "9999px",
    display: "block",
    height: "0.875rem",
    transform: "translateX(0)",
    width: "0.875rem",
  },
  thumbChecked: {
    transform: "translateX(0.875rem)",
  },
});
