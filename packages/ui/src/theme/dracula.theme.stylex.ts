import * as stylex from "@stylexjs/stylex";
import { tokens } from "../theme.stylex";

export const draculaTheme = stylex.createTheme(tokens, {
  accent: "oklch(0.72 0.14 302)",
  backdrop: "oklch(0 0 0 / 72%)",
  border: "oklch(0.22 0.018 285)",
  canvas: "oklch(0.13 0.014 285)",
  composerGlowEnd: "oklch(0.78 0.085 213)",
  composerGlowFirstBlend: "oklch(0.72 0.14 302)",
  composerGlowSecondBlend: "oklch(0.52 0.065 269)",
  composerGlowStart: "oklch(0.7 0.16 347)",
  danger: "oklch(0.66 0.17 24)",
  foreground: "oklch(0.86 0.008 107)",
  muted: "oklch(0.63 0.012 280)",
  reasoning: "oklch(0.7 0.16 347)",
  shadowLarge: "0 20px 25px -5px oklch(0 0 0 / 32%), 0 8px 10px -6px oklch(0 0 0 / 36%)",
  shadowXLarge: "0 25px 50px -12px oklch(0 0 0 / 52%)",
  storageAppData: "oklch(0.78 0.085 213)",
  storageCache: "oklch(0.63 0.06 270)",
  storageContent: "oklch(0.7 0.13 302)",
  storageLogs: "oklch(0.76 0.105 67)",
  success: "oklch(0.78 0.16 148)",
  surface: "oklch(0.18 0.018 285)",
  surfaceRaised: "oklch(0.24 0.025 285)",
  surfaceRaisedBorder: "oklch(0.29 0.03 285)",
});
