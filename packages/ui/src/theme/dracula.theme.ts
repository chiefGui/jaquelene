import * as stylex from "@stylexjs/stylex";
import type { VarGroup } from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";

type ThemeColorOverrides = typeof colors extends VarGroup<infer Tokens> ? Tokens : never;

// Based on Dracula Classic's reference, UI, and functional palettes:
// https://draculatheme.com/spec
export const draculaTheme = stylex.createTheme(colors, {
  // Surfaces
  backgroundCanvas: "oklch(0.21988 0.01373 278.8)",
  backgroundSurface: "oklch(0.25538 0.01884 280.49)",
  backgroundSurfaceRaised: "oklch(0.28823 0.0221 277.51)",
  backgroundSurfaceOverlay: "oklch(0.3402 0.02663 276.05)",
  backgroundScrim: "oklch(0 0 0 / 72%)",

  // Neutral backgrounds, from lowest to highest emphasis
  backgroundNeutralSubtlest: "oklch(0.97748 0.00791 106.55 / 4%)",
  backgroundNeutralSubtler: "oklch(0.97748 0.00791 106.55 / 7%)",
  backgroundNeutralSubtle: "oklch(0.97748 0.00791 106.55 / 10%)",
  backgroundSelected: "oklch(0.4028 0.03216 277.83)",
  backgroundSelectedHover: "oklch(0.437 0.044 283)",

  // Accent backgrounds
  backgroundAccentBold: "oklch(0.74202 0.14855 301.88)",
  backgroundAccentBoldHover: "oklch(0.81116 0.1221 307.03)",

  // Danger backgrounds
  backgroundDangerSubtlest: "oklch(0.62852 0.17607 35.2 / 10%)",
  backgroundDangerSubtle: "oklch(0.62852 0.17607 35.2 / 15%)",
  backgroundDangerBold: "oklch(0.62852 0.17607 35.2)",
  backgroundDangerBoldHover: "oklch(0.6822 0.20633 24.43)",

  // Control backgrounds
  backgroundControlChecked: "oklch(0.57371 0.1797 293.97)",
  backgroundControlThumb: "oklch(0.97748 0.00791 106.55)",
  backgroundControlThumbChecked: "oklch(0.21988 0.01373 278.8)",

  // Product backgrounds
  backgroundReasoningSubtle: "oklch(0.75461 0.18307 346.81 / 14%)",

  // Loading backgrounds
  backgroundSkeleton: "oklch(0.97748 0.00791 106.55 / 7%)",
  backgroundSkeletonShimmer: "oklch(0.97748 0.00791 106.55 / 7%)",

  // Text selection background
  backgroundTextSelection: "oklch(0.4028 0.03216 277.83)",

  // Default foregrounds
  foregroundPrimary: "oklch(0.97748 0.00791 106.55)",
  foregroundSecondary: "oklch(0.97748 0.00791 106.55 / 72%)",
  foregroundDisabled: "oklch(0.55981 0.08027 270.09)",

  // Interactive foregrounds
  foregroundAccent: "oklch(0.74202 0.14855 301.88)",
  foregroundLink: "oklch(0.88263 0.09338 212.85)",
  foregroundLinkHover: "oklch(0.94311 0.08697 195.78)",

  // Semantic foregrounds
  // The lightness lift keeps danger copy AA-readable on overlay surfaces.
  foregroundDanger: "oklch(0.74 0.17758 22.64)",
  foregroundSuccess: "oklch(0.871 0.21952 148.02)",
  foregroundReasoning: "oklch(0.75461 0.18307 346.81)",

  // Paired foregrounds
  foregroundOnAccent: "oklch(0.21988 0.01373 278.8)",
  foregroundOnDanger: "oklch(0.21988 0.01373 278.8)",

  // Text selection foreground
  foregroundTextSelection: "oklch(0.97748 0.00791 106.55)",

  // Borders and focus
  borderSubtle: "oklch(0.55981 0.08027 270.09 / 18%)",
  borderDefault: "oklch(0.55981 0.08027 270.09 / 30%)",
  borderAccent: "oklch(0.74202 0.14855 301.88)",
  borderFocus: "oklch(0.74202 0.14855 301.88)",
  borderDanger: "oklch(0.62852 0.17607 35.2 / 68%)",
  borderDangerFocus: "oklch(0.62852 0.17607 35.2)",
  borderControlChecked: "oklch(0.57371 0.1797 293.97)",
  focusRing: "oklch(0.74202 0.14855 301.88)",

  // Native controls
  controlAccent: "oklch(0.74202 0.14855 301.88)",

  // Storage visualization
  chartStorageContent: "oklch(0.74202 0.14855 301.88)",
  chartStorageCache: "oklch(0.55981 0.08027 270.09)",
  chartStorageAppData: "oklch(0.88263 0.09338 212.85)",
  chartStorageLogs: "oklch(0.83393 0.12413 66.56)",

  // Theme preview
  effectThemePreviewStart: "oklch(0.75461 0.18307 346.81)",
  effectThemePreviewMiddle: "oklch(0.74202 0.14855 301.88)",
  effectThemePreviewEnd: "oklch(0.88263 0.09338 212.85)",
  effectThemePreviewGlow: "oklch(0.74202 0.14855 301.88)",

  // Composer
  effectComposerGlowStart: "oklch(0.75461 0.18307 346.81)",
  effectComposerGlowMiddleStart: "oklch(0.74202 0.14855 301.88)",
  effectComposerGlowMiddleEnd: "oklch(0.55981 0.08027 270.09)",
  effectComposerGlowEnd: "oklch(0.88263 0.09338 212.85)",
} satisfies ThemeColorOverrides);
