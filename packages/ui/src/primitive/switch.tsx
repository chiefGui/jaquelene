import {
  Button as AriakitButton,
  type ButtonProps as AriakitButtonProps,
} from "@ariakit/react/button";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { colors, radii, tokens } from "../tokens.stylex";

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
        <span {...stylex.props(styles.thumb)} />
      </span>
    </AriakitButton>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: radii.control,
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
    alignItems: "center",
    backgroundColor: colors.backgroundSurfaceRaised,
    borderColor: colors.borderDefault,
    borderRadius: radii.full,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    display: "flex",
    height: "1.125rem",
    justifyContent: "flex-start",
    outlineColor: {
      default: null,
      [stylex.when.ancestor("[data-focus-visible]")]: colors.focusRing,
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
    paddingInline: "0.0625rem",
    width: "2rem",
  },
  trackChecked: {
    backgroundColor: colors.backgroundControlChecked,
    borderColor: colors.borderControlChecked,
    justifyContent: "flex-end",
  },
  thumb: {
    backgroundColor: colors.backgroundControlThumb,
    borderRadius: radii.full,
    display: "block",
    flexShrink: 0,
    height: "0.875rem",
    width: "0.875rem",
  },
});
