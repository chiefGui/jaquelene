import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { tokens } from "../theme.stylex";
import { useReducedMotion } from "./motion";

export type SkeletonProps = Omit<
  ComponentProps<"div">,
  "aria-hidden" | "children" | "className" | "style"
> & {
  style?: StyleXStyles;
};

export function Skeleton({ style, ...props }: SkeletonProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div
      {...props}
      aria-hidden="true"
      {...stylex.props(styles.root, !reducedMotion && styles.animated, style)}
    />
  );
}

const pulse = stylex.keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.5 },
});

const styles = stylex.create({
  root: {
    backgroundColor: `color-mix(in oklab, ${tokens.accent} 10%, transparent)`,
    borderRadius: tokens.radiusMedium,
  },
  animated: {
    animationDuration: "2s",
    animationIterationCount: "infinite",
    animationName: pulse,
    animationTimingFunction: "cubic-bezier(0.4, 0, 0.6, 1)",
  },
});
