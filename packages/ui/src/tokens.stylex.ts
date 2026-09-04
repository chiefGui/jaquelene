import * as stylex from "@stylexjs/stylex";

// Jaquelene is the default color theme. Alternate themes override this shared
// semantic contract with stylex.createTheme.
export const colors = stylex.defineVars({
  // Surfaces
  backgroundCanvas: "oklch(0.135 0.01 272)",
  backgroundSurface: "oklch(0.17 0.012 272)",
  backgroundSurfaceRaised: "oklch(0.215 0.016 274)",
  backgroundSurfaceOverlay: "oklch(0.255 0.019 275)",
  backgroundScrim: "oklch(0 0 0 / 55%)",

  // Neutral backgrounds, from lowest to highest emphasis
  backgroundNeutralSubtlest: "oklch(0.925 0.014 282 / 3.5%)",
  backgroundNeutralSubtler: "oklch(0.925 0.014 282 / 6%)",
  backgroundNeutralSubtle: "oklch(0.925 0.014 282 / 9%)",

  // Interactive backgrounds, from subtle feedback to selection
  backgroundInteractive: "oklch(0.71 0.08 276 / 10%)",
  backgroundSelected: "oklch(0.71 0.08 276 / 19%)",
  backgroundSelectedHover: "oklch(0.71 0.08 276 / 24%)",

  // Button
  buttonSoftBackground: "oklch(0.71 0.08 276 / 8%)",
  buttonSoftBackgroundHover: "oklch(0.71 0.08 276 / 12%)",
  buttonSolidBackground: "oklch(0.925 0.014 282 / 90%)",
  buttonSolidBackgroundHover: "oklch(0.925 0.014 282)",
  buttonSolidForeground: "oklch(0.135 0.01 272)",
  buttonDangerSubtleBackground: "oklch(0.7 0.16 22 / 8%)",
  buttonDangerSubtleBackgroundStrong: "oklch(0.7 0.16 22 / 12%)",
  buttonDangerSolidBackground: "oklch(0.6 0.135 22)",
  buttonDangerSolidBackgroundHover: "oklch(0.7 0.16 22)",
  buttonDangerSolidForeground: "oklch(0.135 0.01 272)",

  // Control backgrounds
  backgroundControlChecked: "oklch(0.55 0.11 158)",
  backgroundControlThumb: "oklch(0.925 0.014 282)",

  // Product backgrounds
  backgroundReasoningSubtle: "oklch(0.75 0.1 305 / 14%)",

  // Loading backgrounds
  backgroundSkeleton: "oklch(0.925 0.014 282 / 6%)",
  backgroundSkeletonShimmer: "oklch(0.925 0.014 282 / 6%)",

  // Text selection background
  backgroundTextSelection: "oklch(0.71 0.08 276 / 35%)",

  // Default foregrounds
  foregroundPrimary: "oklch(0.925 0.014 282)",
  foregroundSecondary: "oklch(0.68 0.03 280)",
  foregroundDisabled: "oklch(0.54 0.025 280)",

  // Interactive foregrounds
  foregroundAccent: "oklch(0.71 0.08 276)",
  foregroundLink: "oklch(0.76 0.09 276)",
  foregroundLinkHover: "oklch(0.84 0.07 276)",

  // Semantic foregrounds
  foregroundDanger: "oklch(0.7 0.16 22)",
  foregroundSuccess: "oklch(0.75 0.13 158)",
  foregroundReasoning: "oklch(0.75 0.1 305)",

  // Text selection foreground
  foregroundTextSelection: "oklch(0.925 0.014 282)",

  // Borders and focus
  borderSubtle: "oklch(0.225 0.016 274)",
  borderDefault: "oklch(0.29 0.02 276)",
  borderOverlay: "oklch(0.31 0.022 276)",
  borderAccent: "oklch(0.71 0.08 276)",
  borderFocus: "oklch(0.71 0.08 276 / 45%)",
  borderDanger: "oklch(0.7 0.16 22 / 58%)",
  borderDangerFocus: "oklch(0.7 0.16 22 / 72%)",
  borderControlChecked: "oklch(0.58 0.12 158)",
  focusRing: "oklch(0.71 0.08 276 / 70%)",

  // Native controls
  controlAccent: "oklch(0.71 0.08 276)",

  // Storage visualization
  chartStorageContent: "oklch(0.73 0.11 276)",
  chartStorageCache: "oklch(0.72 0.025 250)",
  chartStorageAppData: "oklch(0.74 0.1 215)",
  chartStorageLogs: "oklch(0.76 0.1 82)",

  // Theme preview
  effectThemePreviewStart: "oklch(0.75 0.1 305)",
  effectThemePreviewMiddle: "oklch(0.71 0.08 276)",
  effectThemePreviewEnd: "oklch(0.74 0.1 215)",
  effectThemePreviewGlow: "oklch(0.71 0.08 276)",

  // Composer
  effectComposerGlowStart: "oklch(0.7033 0.2499 323.8)",
  effectComposerGlowMiddleStart: "oklch(0.5999 0.2354 290)",
  effectComposerGlowMiddleEnd: "oklch(0.6396 0.1928 262.2)",
  effectComposerGlowEnd: "oklch(0.8366 0.1376 213.4)",
});

export const tokens = stylex.defineConsts({
  // Control geometry
  controlHeight: "2rem",
  controlHeightSmall: "1.5rem",

  // Typography
  fontGeist: '"Geist Variable", ui-sans-serif, system-ui, sans-serif',
  fontInter: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
  fontMono:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSystem: "ui-sans-serif, system-ui, sans-serif",
  fontSizeXXSmall: "0.6875rem",
  fontSizeXSmall: "0.75rem",
  fontSizeSmall: "0.8125rem",
  fontSizeBase: "0.875rem",
  fontSizeLarge: "1rem",
  lineHeightXXSmall: "0.875rem",
  lineHeightXSmall: "1rem",
  lineHeightSmall: "1.125rem",
  lineHeightBase: "1.25rem",
  lineHeightLarge: "1.5rem",
});

// Shape roles keep component geometry consistent without making it part of a
// color theme. Control and surface intentionally share a value today, but are
// separate roles so either can evolve without coupling unrelated components.
export const radii = stylex.defineConsts({
  small: "0.25rem",
  compact: "0.5rem",
  content: "0.625rem",
  control: "0.75rem",
  surface: "0.75rem",
  full: "9999px",
});

// Elevation follows interaction roles rather than an open-ended size scale.
export const shadows = stylex.defineConsts({
  control: `inset 0 0.0625rem 0 color-mix(in oklch, ${colors.foregroundPrimary} 5%, transparent), 0 0.0625rem 0.125rem color-mix(in oklch, ${colors.backgroundCanvas} 45%, transparent)`,
  floating: `inset 0 0.0625rem 0 color-mix(in oklch, ${colors.foregroundPrimary} 5%, transparent), 0 0.125rem 0.375rem -0.125rem color-mix(in oklch, ${colors.backgroundCanvas} 55%, transparent), 0 0.5rem 1rem -0.5rem color-mix(in oklch, ${colors.backgroundCanvas} 70%, transparent)`,
});
