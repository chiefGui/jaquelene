import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";

export type ControlIconProps = Omit<
  ComponentProps<"svg">,
  "aria-hidden" | "children" | "className" | "focusable" | "style" | "viewBox"
> & {
  style?: StyleXStyles;
};

function ChevronIcon({ style, ...props }: ControlIconProps) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 12 12"
      {...stylex.props(styles.root, style)}
    >
      <path d="m4.25 2.25 3.5 3.75-3.5 3.75" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function CheckIcon({ style, ...props }: ControlIconProps) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 12 12"
      {...stylex.props(styles.root, style)}
    >
      <path
        d="m2.25 6.25 2.25 2.25 5.25-5.25"
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export const ControlIcon = {
  Check: CheckIcon,
  Chevron: ChevronIcon,
} as const;

const styles = stylex.create({
  root: {
    display: "block",
    fill: "none",
    flexShrink: 0,
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
});
