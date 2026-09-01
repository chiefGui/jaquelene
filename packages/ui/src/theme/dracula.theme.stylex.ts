import * as stylex from "@stylexjs/stylex";
import { tokens } from "../theme.stylex";

export const draculaTheme = stylex.createTheme(tokens, {
  accent: "#bd93f9",
  backdrop: "rgb(5 6 9 / 72%)",
  border: "#353746",
  canvas: "#111218",
  composerGlowEnd: "#78c4d2",
  composerGlowFirstBlend: "#bd93f9",
  composerGlowSecondBlend: "#59678e",
  composerGlowStart: "#df75b4",
  danger: "#e66f78",
  foreground: "#dedfda",
  muted: "#92949c",
  reasoning: "#df75b4",
  shadowLarge: "0 20px 25px -5px rgb(5 6 9 / 32%), 0 8px 10px -6px rgb(5 6 9 / 36%)",
  shadowXLarge: "0 25px 50px -12px rgb(5 6 9 / 52%)",
  storageAppData: "#78c4d2",
  storageCache: "#8995b6",
  storageContent: "#b78ff0",
  storageLogs: "#d89f69",
  success: "#67d38a",
  surface: "#1d1f29",
  surfaceRaised: "#292b38",
  surfaceRaisedBorder: "#4a4d60",
});
