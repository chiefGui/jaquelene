import * as stylex from "@stylexjs/stylex";

export const jaquelenePalette = stylex.defineConsts({
  // Backgrounds
  backgroundCanvas: "oklch(0.135 0.01 272)",
  backgroundSurface: "oklch(0.17 0.012 272)",
  backgroundRaised: "oklch(0.215 0.016 274)",
  backgroundOverlay: "oklch(0 0 0 / 55%)",
  backgroundSubtle: "oklch(0.925 0.014 282 / 3.5%)",
  backgroundSubtleHover: "oklch(0.925 0.014 282 / 6%)",

  // Foreground
  foregroundPrimary: "oklch(0.925 0.014 282)",
  foregroundSecondary: "oklch(0.68 0.03 280)",
  foregroundDisabled: "oklch(0.54 0.025 280)",
  foregroundOnInteractive: "oklch(0.135 0.01 272)",

  // Borders and focus
  borderSubtle: "oklch(0.225 0.016 274)",
  borderDefault: "oklch(0.29 0.02 276)",
  borderFocus: "oklch(0.71 0.08 276 / 45%)",
  borderDanger: "oklch(0.7 0.16 22 / 58%)",
  borderDangerStrong: "oklch(0.7 0.16 22 / 72%)",
  focusRing: "oklch(0.71 0.08 276 / 70%)",

  // Interaction
  interactive: "oklch(0.71 0.08 276)",
  interactiveSubtle: "oklch(0.71 0.08 276 / 8%)",
  interactiveHover: "oklch(0.71 0.08 276 / 11%)",
  interactivePressed: "oklch(0.71 0.08 276 / 15%)",
  interactiveSelected: "oklch(0.71 0.08 276 / 19%)",
  interactiveSelectedHover: "oklch(0.71 0.08 276 / 24%)",
  link: "oklch(0.76 0.09 276)",
  linkHover: "oklch(0.84 0.07 276)",
  selectionBackground: "oklch(0.71 0.08 276 / 35%)",
  selectionForeground: "oklch(0.925 0.014 282)",
  actionPrimary: "oklch(0.925 0.014 282 / 90%)",
  actionPrimaryHover: "oklch(0.925 0.014 282)",
  actionPrimaryForeground: "oklch(0.135 0.01 272)",
  controlChecked: "oklch(0.55 0.06 276)",
  controlCheckedBorder: "oklch(0.565 0.065 276)",

  // Status
  danger: "oklch(0.7 0.16 22)",
  dangerSurface: "oklch(0.7 0.16 22 / 8%)",
  dangerSurfaceHover: "oklch(0.7 0.16 22 / 12%)",
  dangerSolid: "oklch(0.6 0.135 22)",
  dangerSolidHover: "oklch(0.7 0.16 22)",
  foregroundOnDanger: "oklch(0.135 0.01 272)",
  success: "oklch(0.75 0.13 158)",

  // Product semantics
  reasoning: "oklch(0.75 0.1 305)",
  reasoningSurface: "oklch(0.75 0.1 305 / 14%)",

  // Storage visualization
  storageContent: "oklch(0.73 0.11 276)",
  storageCache: "oklch(0.72 0.025 250)",
  storageAppData: "oklch(0.74 0.1 215)",
  storageLogs: "oklch(0.76 0.1 82)",

  // Composer
  composerGlowStart: "oklch(0.7033 0.2499 323.8)",
  composerGlowFirstBlend: "oklch(0.5999 0.2354 290)",
  composerGlowSecondBlend: "oklch(0.6396 0.1928 262.2)",
  composerGlowEnd: "oklch(0.8366 0.1376 213.4)",
});
