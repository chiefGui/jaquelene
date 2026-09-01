import * as stylex from "@stylexjs/stylex";
import { tokens } from "../theme.stylex";

export const draculaTheme = stylex.createTheme(tokens, {
  accent: "#bd93f9",
  backdrop: "rgb(8 9 12 / 64%)",
  border: "#383a4a",
  canvas: "#1f2029",
  composerGlowEnd: "#8be9fd",
  composerGlowFirstBlend: "#bd93f9",
  composerGlowSecondBlend: "#6272a4",
  composerGlowStart: "#ff79c6",
  danger: "color-mix(in oklab, #ff5555 78%, #f8f8f2)",
  foreground: "#f8f8f2",
  muted: "color-mix(in oklab, #6272a4 68%, #f8f8f2)",
  reasoning: "#ff79c6",
  shadowLarge: "0 20px 25px -5px rgb(8 9 12 / 20%), 0 8px 10px -6px rgb(8 9 12 / 24%)",
  shadowXLarge: "0 25px 50px -12px rgb(8 9 12 / 42%)",
  storageAppData: "#8be9fd",
  storageCache: "color-mix(in oklab, #6272a4 65%, #f8f8f2)",
  storageContent: "#bd93f9",
  storageLogs: "#ffb86c",
  success: "#50fa7b",
  surface: "#282a36",
  surfaceRaised: "#30313e",
  surfaceRaisedBorder: "#4a4d60",
});
