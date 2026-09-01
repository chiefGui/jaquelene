import * as stylex from "@stylexjs/stylex";

export const draculaPalette = stylex.defineConsts({
  // Surfaces
  canvas: "oklch(0.13 0.014 285)",
  surface: "oklch(0.18 0.018 285)",
  surfaceRaised: "oklch(0.24 0.025 285)",
  border: "oklch(0.22 0.018 285)",
  surfaceRaisedBorder: "oklch(0.29 0.03 285)",
  backdrop: "oklch(0 0 0 / 72%)",

  // Content and state
  foreground: "oklch(0.86 0.008 107)",
  muted: "oklch(0.63 0.012 280)",
  accent: "oklch(0.72 0.14 302)",
  danger: "oklch(0.66 0.17 24)",
  success: "oklch(0.78 0.16 148)",
  reasoning: "oklch(0.7 0.16 347)",

  // Storage visualization
  storageContent: "oklch(0.7 0.13 302)",
  storageCache: "oklch(0.63 0.06 270)",
  storageAppData: "oklch(0.78 0.085 213)",
  storageLogs: "oklch(0.76 0.105 67)",

  // Composer glow
  composerGlowStart: "oklch(0.7 0.16 347)",
  composerGlowFirstBlend: "oklch(0.72 0.14 302)",
  composerGlowSecondBlend: "oklch(0.52 0.065 269)",
  composerGlowEnd: "oklch(0.78 0.085 213)",
});
