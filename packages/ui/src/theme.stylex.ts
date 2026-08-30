import * as stylex from "@stylexjs/stylex";

export const tokens = stylex.defineVars({
  accent: "oklch(0.71 0.08 276)",
  backdrop: "oklch(0 0 0 / 55%)",
  border: "oklch(0.225 0.016 274)",
  canvas: "oklch(0.135 0.01 272)",
  danger: "oklch(0.7 0.16 22)",
  dangerSurface: "oklch(0.3 0.05 22)",
  dangerSurfaceHover: "oklch(0.35 0.062 22)",
  foreground: "oklch(0.925 0.014 282)",
  muted: "oklch(0.68 0.03 280)",
  success: "oklch(0.75 0.13 158)",
  surface: "oklch(0.17 0.012 272)",
  surfaceRaised: "oklch(0.215 0.016 274)",
  surfaceRaisedBorder: "oklch(0.29 0.02 276)",

  controlHeight: "2rem",
  radiusLarge: "0.625rem",
  radiusMedium: "0.5rem",
  radiusSmall: "0.25rem",
  radiusXLarge: "0.75rem",
  shadowLarge: "0 20px 25px -5px oklch(0 0 0 / 10%), 0 8px 10px -6px oklch(0 0 0 / 10%)",
  shadowXLarge: "0 25px 50px -12px oklch(0 0 0 / 25%)",

  fontGeist: '"Geist Variable", ui-sans-serif, system-ui, sans-serif',
  fontInter: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
  fontMono:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSystem: "ui-sans-serif, system-ui, sans-serif",
  fontSizeBase: "0.875rem",
  fontSizeLarge: "1rem",
  fontSizeSmall: "0.8125rem",
  fontSizeXSmall: "0.75rem",
  lineHeightBase: "1.25rem",
  lineHeightLarge: "1.5rem",
  lineHeightSmall: "1.125rem",
  lineHeightXSmall: "1rem",
});
