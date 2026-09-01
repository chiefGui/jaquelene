import * as stylex from "@stylexjs/stylex";
import { tokens } from "../theme.stylex";

export const jaqueleneTheme = stylex.createTheme(tokens, {
  accent: "oklch(0.71 0.08 276)",
  backdrop: "oklch(0 0 0 / 55%)",
  border: "oklch(0.225 0.016 274)",
  canvas: "oklch(0.135 0.01 272)",
  composerGlowEnd: "oklch(0.8366 0.1376 213.4)",
  composerGlowFirstBlend: "oklch(0.5999 0.2354 290)",
  composerGlowSecondBlend: "oklch(0.6396 0.1928 262.2)",
  composerGlowStart: "oklch(0.7033 0.2499 323.8)",
  danger: "oklch(0.7 0.16 22)",
  foreground: "oklch(0.925 0.014 282)",
  muted: "oklch(0.68 0.03 280)",
  reasoning: "oklch(0.75 0.1 305)",
  shadowLarge: "0 20px 25px -5px oklch(0 0 0 / 10%), 0 8px 10px -6px oklch(0 0 0 / 10%)",
  shadowXLarge: "0 25px 50px -12px oklch(0 0 0 / 25%)",
  storageAppData: "oklch(0.74 0.1 215)",
  storageCache: "oklch(0.72 0.025 250)",
  storageContent: "oklch(0.73 0.11 276)",
  storageLogs: "oklch(0.76 0.1 82)",
  success: "oklch(0.75 0.13 158)",
  surface: "oklch(0.17 0.012 272)",
  surfaceRaised: "oklch(0.215 0.016 274)",
  surfaceRaisedBorder: "oklch(0.29 0.02 276)",
});
