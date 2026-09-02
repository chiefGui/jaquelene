import * as stylex from "@stylexjs/stylex";
import { jaquelenePalette } from "./theme/jaquelene.theme.stylex";

export type ThemePalette = Readonly<Record<keyof typeof jaquelenePalette, string>>;

// StyleX only extracts variables from a statically visible object literal.
export const colors = stylex.defineVars({
  // Backgrounds
  backgroundCanvas: jaquelenePalette.backgroundCanvas,
  backgroundSurface: jaquelenePalette.backgroundSurface,
  backgroundRaised: jaquelenePalette.backgroundRaised,
  backgroundFloating: jaquelenePalette.backgroundFloating,
  backgroundOverlay: jaquelenePalette.backgroundOverlay,
  backgroundSubtle: jaquelenePalette.backgroundSubtle,
  backgroundSubtleHover: jaquelenePalette.backgroundSubtleHover,
  backgroundSubtlePressed: jaquelenePalette.backgroundSubtlePressed,

  // Foreground
  foregroundPrimary: jaquelenePalette.foregroundPrimary,
  foregroundSecondary: jaquelenePalette.foregroundSecondary,
  foregroundDisabled: jaquelenePalette.foregroundDisabled,
  foregroundOnInteractive: jaquelenePalette.foregroundOnInteractive,

  // Borders and focus
  borderSubtle: jaquelenePalette.borderSubtle,
  borderDefault: jaquelenePalette.borderDefault,
  borderFocus: jaquelenePalette.borderFocus,
  borderDanger: jaquelenePalette.borderDanger,
  borderDangerStrong: jaquelenePalette.borderDangerStrong,
  focusRing: jaquelenePalette.focusRing,

  // Interaction
  accent: jaquelenePalette.accent,
  backgroundSelected: jaquelenePalette.backgroundSelected,
  backgroundSelectedHover: jaquelenePalette.backgroundSelectedHover,
  link: jaquelenePalette.link,
  linkHover: jaquelenePalette.linkHover,
  selectionBackground: jaquelenePalette.selectionBackground,
  selectionForeground: jaquelenePalette.selectionForeground,
  actionPrimary: jaquelenePalette.actionPrimary,
  actionPrimaryHover: jaquelenePalette.actionPrimaryHover,
  actionPrimaryForeground: jaquelenePalette.actionPrimaryForeground,
  controlChecked: jaquelenePalette.controlChecked,
  controlCheckedBorder: jaquelenePalette.controlCheckedBorder,

  // Status
  danger: jaquelenePalette.danger,
  dangerSurface: jaquelenePalette.dangerSurface,
  dangerSurfaceHover: jaquelenePalette.dangerSurfaceHover,
  dangerSolid: jaquelenePalette.dangerSolid,
  dangerSolidHover: jaquelenePalette.dangerSolidHover,
  foregroundOnDanger: jaquelenePalette.foregroundOnDanger,
  success: jaquelenePalette.success,

  // Product semantics
  reasoning: jaquelenePalette.reasoning,
  reasoningSurface: jaquelenePalette.reasoningSurface,

  // Storage visualization
  storageContent: jaquelenePalette.storageContent,
  storageCache: jaquelenePalette.storageCache,
  storageAppData: jaquelenePalette.storageAppData,
  storageLogs: jaquelenePalette.storageLogs,

  // Composer
  composerGlowStart: jaquelenePalette.composerGlowStart,
  composerGlowFirstBlend: jaquelenePalette.composerGlowFirstBlend,
  composerGlowSecondBlend: jaquelenePalette.composerGlowSecondBlend,
  composerGlowEnd: jaquelenePalette.composerGlowEnd,
} satisfies ThemePalette);

export const tokens = stylex.defineConsts({
  // Control geometry
  controlHeight: "2rem",
  radiusSmall: "0.25rem",
  radiusMedium: "0.5rem",
  radiusLarge: "0.625rem",
  radiusXLarge: "0.75rem",

  // Elevation
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
