import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { radii } from "../tokens.stylex";
import { useReducedMotion } from "./motion";

export type PingProps = {
  style?: StyleXStyles;
};

export function Ping({ style }: PingProps) {
  const reducedMotion = useReducedMotion();

  return (
    <span aria-hidden="true" {...stylex.props(styles.root, style)}>
      {reducedMotion ? null : <span {...stylex.props(styles.wave)} />}
      <span {...stylex.props(styles.dot)} />
    </span>
  );
}

const ping = stylex.keyframes({
  "75%, 100%": {
    opacity: 0,
    transform: "scale(2)",
  },
});

const styles = stylex.create({
  root: {
    display: "inline-flex",
    flexShrink: 0,
    height: "0.5rem",
    position: "relative",
    width: "0.5rem",
  },
  wave: {
    animationDuration: "2s",
    animationIterationCount: "infinite",
    animationName: ping,
    animationTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
    backgroundColor: "currentColor",
    borderRadius: radii.full,
    height: "100%",
    opacity: 0.25,
    position: "absolute",
    width: "100%",
  },
  dot: {
    backgroundColor: "currentColor",
    borderRadius: radii.full,
    height: "100%",
    position: "relative",
    width: "100%",
  },
});
