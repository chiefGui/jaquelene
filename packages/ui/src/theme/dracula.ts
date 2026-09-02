import * as stylex from "@stylexjs/stylex";
import type { VarGroup } from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";

type ThemeColorOverrides = typeof colors extends VarGroup<infer Tokens> ? Tokens : never;

// Based on Dracula's current website UI and the Dracula Classic specification:
// https://draculatheme.com/
// https://draculatheme.com/spec
export const draculaTheme = stylex.createTheme(colors, {
  // Surfaces
  backgroundCanvas: "oklch(0.16218 0.00847 296.89)",
  backgroundSurface: "oklch(0.22635 0.01351 291.83)",
  backgroundSurfaceRaised: "oklch(0.2668 0.01861 294.27)",
  backgroundSurfaceOverlay: "oklch(0.30428 0.02155 292.71)",
  backgroundScrim: "oklch(0.16218 0.00847 296.89 / 84%)",

  // Neutral backgrounds, from lowest to highest emphasis
  backgroundNeutralSubtlest: "oklch(0.86523 0.01381 295.28 / 4%)",
  backgroundNeutralSubtler: "oklch(0.86523 0.01381 295.28 / 7%)",
  backgroundNeutralSubtle: "oklch(0.86523 0.01381 295.28 / 10%)",

  // Interactive backgrounds, from subtle feedback to selection
  backgroundInteractive: "oklch(0.86523 0.01381 295.28 / 8%)",
  backgroundSelected: "oklch(0.86523 0.01381 295.28 / 13%)",
  backgroundSelectedHover: "oklch(0.86523 0.01381 295.28 / 17%)",

  // Button
  buttonSoftBackground: colors.backgroundNeutralSubtlest,
  buttonSoftBackgroundHover: colors.backgroundNeutralSubtler,
  buttonSolidBackground: "oklch(0.48 0.2 284)",
  buttonSolidBackgroundHover: "oklch(0.5 0.2 284)",
  buttonSolidForeground: "oklch(0.91559 0.00947 292.78)",
  buttonDangerSubtleBackground: "oklch(0.70927 0.1686 32.68 / 8%)",
  buttonDangerSubtleBackgroundStrong: "oklch(0.70927 0.1686 32.68 / 10%)",
  buttonDangerSolidBackground: "oklch(0.70927 0.1686 32.68)",
  buttonDangerSolidBackgroundHover: "oklch(0.75 0.15 34)",
  buttonDangerSolidForeground: "oklch(0.16218 0.00847 296.89)",

  // Control backgrounds
  backgroundControlChecked: "oklch(0.58 0.16 142)",
  backgroundControlThumb: "oklch(0.86523 0.01381 295.28)",

  // Product backgrounds
  backgroundReasoningSubtle: "oklch(0.69616 0.20719 353.11 / 10%)",

  // Loading backgrounds
  backgroundSkeleton: "oklch(0.86523 0.01381 295.28 / 7%)",
  backgroundSkeletonShimmer: "oklch(0.86523 0.01381 295.28 / 12%)",

  // Text selection background
  backgroundTextSelection: "oklch(0.58172 0.22593 284.37 / 45%)",

  // Default foregrounds
  foregroundPrimary: "oklch(0.86523 0.01381 295.28)",
  foregroundSecondary: "oklch(0.7618 0.02423 293.92)",
  foregroundDisabled: "oklch(0.59974 0.04238 291.62)",

  // Interactive foregrounds
  foregroundAccent: "oklch(0.6493 0.18797 287.7)",
  foregroundLink: "oklch(0.88229 0.13417 179.69)",
  foregroundLinkHover: "oklch(0.93 0.1 180)",

  // Semantic foregrounds
  foregroundDanger: "oklch(0.78 0.14 34)",
  foregroundSuccess: "oklch(0.86812 0.23551 141.97)",
  foregroundReasoning: "oklch(0.8 0.14 353)",

  // Text selection foreground
  foregroundTextSelection: "oklch(0.91559 0.00947 292.78)",

  // Borders and focus
  borderSubtle: "oklch(0.34109 0.02613 291.06 / 55%)",
  borderDefault: "oklch(0.34109 0.02613 291.06)",
  borderOverlay: "oklch(0.36 0.028 291.06)",
  borderAccent: "oklch(0.6493 0.18797 287.7)",
  borderFocus: "oklch(0.6493 0.18797 287.7)",
  borderDanger: "oklch(0.70927 0.1686 32.68 / 65%)",
  borderDangerFocus: "oklch(0.70927 0.1686 32.68)",
  borderControlChecked: "oklch(0.6 0.17 142)",
  focusRing: "oklch(0.6493 0.18797 287.7)",

  // Native controls
  controlAccent: "oklch(0.58172 0.22593 284.37)",

  // Storage visualization
  chartStorageContent: "oklch(0.6493 0.18797 287.7)",
  chartStorageCache: "oklch(0.7618 0.02423 293.92)",
  chartStorageAppData: "oklch(0.88229 0.13417 179.69)",
  chartStorageLogs: "oklch(0.82045 0.13312 73.33)",

  // Theme preview
  effectThemePreviewStart: "oklch(0.69616 0.20719 353.11)",
  effectThemePreviewMiddle: "oklch(0.58172 0.22593 284.37)",
  effectThemePreviewEnd: "oklch(0.88229 0.13417 179.69)",
  effectThemePreviewGlow: "oklch(0.58172 0.22593 284.37)",

  // Composer
  effectComposerGlowStart: "oklch(0.69616 0.20719 353.11)",
  effectComposerGlowMiddleStart: "oklch(0.58172 0.22593 284.37)",
  effectComposerGlowMiddleEnd: "oklch(0.6493 0.18797 287.7)",
  effectComposerGlowEnd: "oklch(0.88229 0.13417 179.69)",
} satisfies ThemeColorOverrides);
