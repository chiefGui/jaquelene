import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { colors, tokens } from "../tokens.stylex";
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

const shimmer = stylex.keyframes({
  "0%": { transform: "translateX(-100%)" },
  "60%, 100%": { transform: "translateX(100%)" },
});

const styles = stylex.create({
  root: {
    backgroundColor: `color-mix(in oklch, ${colors.accent} 10%, transparent)`,
    borderRadius: tokens.radiusMedium,
    overflow: "hidden",
    position: "relative",
  },
  animated: {
    "::after": {
      animationDuration: "2s",
      animationIterationCount: "infinite",
      animationName: shimmer,
      animationTimingFunction: "linear",
      backgroundImage: `linear-gradient(105deg, transparent 35%, color-mix(in oklch, ${colors.foreground} 5%, transparent) 50%, transparent 65%)`,
      content: '""',
      inset: 0,
      position: "absolute",
      transform: "translateX(-100%)",
    },
  },
});
