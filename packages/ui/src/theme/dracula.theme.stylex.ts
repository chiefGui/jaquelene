import * as stylex from "@stylexjs/stylex";
import type { ThemePalette } from "../tokens.stylex";

export const draculaPalette = stylex.defineConsts({
  // Backgrounds — Dracula Classic UI palette
  backgroundCanvas: "oklch(0.21988 0.01373 278.8)",
  backgroundSurface: "oklch(0.28823 0.0221 277.51)",
  backgroundRaised: "oklch(0.3402 0.02663 276.05)",
  backgroundOverlay: "oklch(0 0 0 / 72%)",
  backgroundSubtle: "oklch(0.97748 0.00791 106.55 / 4%)",
  backgroundSubtleHover: "oklch(0.97748 0.00791 106.55 / 7%)",

  // Foreground
  foregroundPrimary: "oklch(0.97748 0.00791 106.55)",
  foregroundSecondary: "oklch(0.97748 0.00791 106.55 / 72%)",
  foregroundDisabled: "oklch(0.55981 0.08027 270.09)",
  foregroundOnInteractive: "oklch(0.21988 0.01373 278.8)",

  // Borders and focus
  borderSubtle: "oklch(0.55981 0.08027 270.09 / 32%)",
  borderDefault: "oklch(0.55981 0.08027 270.09 / 52%)",
  borderFocus: "oklch(0.74202 0.14855 301.88 / 58%)",
  borderDanger: "oklch(0.74 0.17758 22.64 / 58%)",
  borderDangerStrong: "oklch(0.74 0.17758 22.64 / 76%)",
  focusRing: "oklch(0.74202 0.14855 301.88 / 78%)",

  // Interaction
  interactive: "oklch(0.74202 0.14855 301.88)",
  interactiveSubtle: "oklch(0.74202 0.14855 301.88 / 8%)",
  interactiveHover: "oklch(0.74202 0.14855 301.88 / 12%)",
  interactivePressed: "oklch(0.74202 0.14855 301.88 / 16%)",
  interactiveSelected: "oklch(0.4028 0.03216 277.83)",
  interactiveSelectedHover: "oklch(0.437 0.044 283)",
  link: "oklch(0.88263 0.09338 212.85)",
  linkHover: "oklch(0.94311 0.08697 195.78)",
  selectionBackground: "oklch(0.4028 0.03216 277.83)",
  selectionForeground: "oklch(0.97748 0.00791 106.55)",
  actionPrimary: "oklch(0.97748 0.00791 106.55 / 90%)",
  actionPrimaryHover: "oklch(0.97748 0.00791 106.55)",
  actionPrimaryForeground: "oklch(0.21988 0.01373 278.8)",
  controlChecked: "oklch(0.74202 0.14855 301.88)",
  controlCheckedBorder: "oklch(0.74202 0.14855 301.88)",

  // Status
  // Bright Red needs a small lightness lift to retain AA text contrast on raised surfaces.
  danger: "oklch(0.74 0.17758 22.64)",
  dangerSurface: "oklch(0.74 0.17758 22.64 / 8%)",
  dangerSurfaceHover: "oklch(0.74 0.17758 22.64 / 12%)",
  dangerSolid: "oklch(0.62852 0.17607 35.2)",
  dangerSolidHover: "oklch(0.6822 0.20633 24.43)",
  foregroundOnDanger: "oklch(0.21988 0.01373 278.8)",
  success: "oklch(0.871 0.21952 148.02)",

  // Product semantics
  reasoning: "oklch(0.75461 0.18307 346.81)",
  reasoningSurface: "oklch(0.75461 0.18307 346.81 / 14%)",

  // Storage visualization
  storageContent: "oklch(0.74202 0.14855 301.88)",
  storageCache: "oklch(0.55981 0.08027 270.09)",
  storageAppData: "oklch(0.88263 0.09338 212.85)",
  storageLogs: "oklch(0.83393 0.12413 66.56)",

  // Composer
  composerGlowStart: "oklch(0.75461 0.18307 346.81)",
  composerGlowFirstBlend: "oklch(0.74202 0.14855 301.88)",
  composerGlowSecondBlend: "oklch(0.55981 0.08027 270.09)",
  composerGlowEnd: "oklch(0.88263 0.09338 212.85)",
} satisfies ThemePalette);
