import * as stylex from "@stylexjs/stylex";

export const jaquelenePalette = stylex.defineConsts({
  // Surfaces
  canvas: "oklch(0.135 0.01 272)",
  surface: "oklch(0.17 0.012 272)",
  surfaceRaised: "oklch(0.215 0.016 274)",
  border: "oklch(0.225 0.016 274)",
  surfaceRaisedBorder: "oklch(0.29 0.02 276)",
  backdrop: "oklch(0 0 0 / 55%)",

  // Content and state
  foreground: "oklch(0.925 0.014 282)",
  muted: "oklch(0.68 0.03 280)",
  accent: "oklch(0.71 0.08 276)",
  danger: "oklch(0.7 0.16 22)",
  success: "oklch(0.75 0.13 158)",
  reasoning: "oklch(0.75 0.1 305)",

  // Storage visualization
  storageContent: "oklch(0.73 0.11 276)",
  storageCache: "oklch(0.72 0.025 250)",
  storageAppData: "oklch(0.74 0.1 215)",
  storageLogs: "oklch(0.76 0.1 82)",

  // Composer glow
  composerGlowStart: "oklch(0.7033 0.2499 323.8)",
  composerGlowFirstBlend: "oklch(0.5999 0.2354 290)",
  composerGlowSecondBlend: "oklch(0.6396 0.1928 262.2)",
  composerGlowEnd: "oklch(0.8366 0.1376 213.4)",
});
