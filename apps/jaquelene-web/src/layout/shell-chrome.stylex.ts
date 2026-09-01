import * as stylex from "@stylexjs/stylex";

export const shellMetrics = stylex.defineVars({
  edgeInset: "0.5rem",
  statusBarHeight: "2.25rem",
});

export const shellChrome = stylex.create({
  header: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: `calc(${shellMetrics.statusBarHeight} + ${shellMetrics.edgeInset})`,
    minWidth: 0,
  },
});
