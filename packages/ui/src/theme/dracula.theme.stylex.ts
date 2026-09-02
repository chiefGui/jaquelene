import * as stylex from "@stylexjs/stylex";
import type { ThemePalette } from "../tokens.stylex";

// Based on Dracula Classic's reference, UI, and functional palettes:
// https://draculatheme.com/spec
export const draculaPalette = stylex.defineConsts({
  // Backgrounds
  backgroundCanvas: "oklch(0.21988 0.01373 278.8)",
  backgroundSurface: "oklch(0.25538 0.01884 280.49)",
  backgroundRaised: "oklch(0.28823 0.0221 277.51)",
  backgroundFloating: "oklch(0.3402 0.02663 276.05)",
  backgroundOverlay: "oklch(0 0 0 / 72%)",
  backgroundSubtle: "oklch(0.97748 0.00791 106.55 / 4%)",
  backgroundSubtleHover: "oklch(0.97748 0.00791 106.55 / 7%)",
  backgroundSubtlePressed: "oklch(0.97748 0.00791 106.55 / 10%)",

  // Foreground
  foregroundPrimary: "oklch(0.97748 0.00791 106.55)",
  foregroundSecondary: "oklch(0.97748 0.00791 106.55 / 72%)",
  foregroundDisabled: "oklch(0.55981 0.08027 270.09)",
  foregroundOnInteractive: "oklch(0.21988 0.01373 278.8)",

  // Borders and focus
  borderSubtle: "oklch(0.55981 0.08027 270.09 / 18%)",
  borderDefault: "oklch(0.55981 0.08027 270.09 / 30%)",
  borderFocus: "oklch(0.74202 0.14855 301.88)",
  borderDanger: "oklch(0.62852 0.17607 35.2 / 68%)",
  borderDangerStrong: "oklch(0.62852 0.17607 35.2)",
  focusRing: "oklch(0.74202 0.14855 301.88)",

  // Interaction
  accent: "oklch(0.74202 0.14855 301.88)",
  backgroundSelected: "oklch(0.4028 0.03216 277.83)",
  backgroundSelectedHover: "oklch(0.437 0.044 283)",
  link: "oklch(0.88263 0.09338 212.85)",
  linkHover: "oklch(0.94311 0.08697 195.78)",
  selectionBackground: "oklch(0.4028 0.03216 277.83)",
  selectionForeground: "oklch(0.97748 0.00791 106.55)",
  actionPrimary: "oklch(0.74202 0.14855 301.88)",
  actionPrimaryHover: "oklch(0.81116 0.1221 307.03)",
  actionPrimaryForeground: "oklch(0.21988 0.01373 278.8)",
  controlChecked: "oklch(0.57371 0.1797 293.97)",
  controlCheckedBorder: "oklch(0.57371 0.1797 293.97)",

  // Status
  // The lightness lift keeps danger copy AA-readable on floating surfaces.
  danger: "oklch(0.74 0.17758 22.64)",
  dangerSurface: "oklch(0.62852 0.17607 35.2 / 10%)",
  dangerSurfaceHover: "oklch(0.62852 0.17607 35.2 / 15%)",
  dangerSolid: "oklch(0.62852 0.17607 35.2)",
  dangerSolidHover: "oklch(0.6822 0.20633 24.43)",
  foregroundOnDanger: "oklch(0.21988 0.01373 278.8)",
  success: "oklch(0.871 0.21952 148.02)",

  // Product semantics
  reasoning: "oklch(0.75461 0.18307 346.81)",
  reasoningSurface: "oklch(0.75461 0.18307 346.81 / 14%)",

  // Storage visualization
  storageContent: "oklch(0.74202 0.14855 301.88)",
  storageCache: "oklch(0.55981 0.08027 270.09)",
  storageAppData: "oklch(0.88263 0.09338 212.85)",
  storageLogs: "oklch(0.83393 0.12413 66.56)",

  // Composer
  composerGlowStart: "oklch(0.75461 0.18307 346.81)",
  composerGlowFirstBlend: "oklch(0.74202 0.14855 301.88)",
  composerGlowSecondBlend: "oklch(0.55981 0.08027 270.09)",
  composerGlowEnd: "oklch(0.88263 0.09338 212.85)",
} satisfies ThemePalette);
