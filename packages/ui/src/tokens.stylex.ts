import * as stylex from "@stylexjs/stylex";
import { jaquelenePalette } from "./theme/jaquelene.theme.stylex";

export const colors = stylex.defineVars({
  // Surfaces
  canvas: jaquelenePalette.canvas,
  surface: jaquelenePalette.surface,
  surfaceRaised: jaquelenePalette.surfaceRaised,
  border: jaquelenePalette.border,
  surfaceRaisedBorder: jaquelenePalette.surfaceRaisedBorder,
  backdrop: jaquelenePalette.backdrop,

  // Content and state
  foreground: jaquelenePalette.foreground,
  muted: jaquelenePalette.muted,
  accent: jaquelenePalette.accent,
  danger: jaquelenePalette.danger,
  success: jaquelenePalette.success,
  reasoning: jaquelenePalette.reasoning,

  // Storage visualization
  storageContent: jaquelenePalette.storageContent,
  storageCache: jaquelenePalette.storageCache,
  storageAppData: jaquelenePalette.storageAppData,
  storageLogs: jaquelenePalette.storageLogs,

  // Composer glow
  composerGlowStart: jaquelenePalette.composerGlowStart,
  composerGlowFirstBlend: jaquelenePalette.composerGlowFirstBlend,
  composerGlowSecondBlend: jaquelenePalette.composerGlowSecondBlend,
  composerGlowEnd: jaquelenePalette.composerGlowEnd,

});

export const tokens = stylex.defineConsts({
  // Control geometry and elevation
  controlHeight: "2rem",
  radiusSmall: "0.25rem",
  radiusMedium: "0.5rem",
  radiusLarge: "0.625rem",
  radiusXLarge: "0.75rem",
  shadowLarge: "0 20px 25px -5px oklch(0 0 0 / 10%), 0 8px 10px -6px oklch(0 0 0 / 10%)",
  shadowXLarge: "0 25px 50px -12px oklch(0 0 0 / 25%)",

  // Typography
  fontGeist: '"Geist Variable", ui-sans-serif, system-ui, sans-serif',
  fontInter: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
  fontMono:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSystem: "ui-sans-serif, system-ui, sans-serif",
  fontSizeXSmall: "0.75rem",
  fontSizeSmall: "0.8125rem",
  fontSizeBase: "0.875rem",
  fontSizeLarge: "1rem",
  lineHeightXSmall: "1rem",
  lineHeightSmall: "1.125rem",
  lineHeightBase: "1.25rem",
  lineHeightLarge: "1.5rem",
});
