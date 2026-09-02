import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { UiThemeStyle } from "./theme";

type ThemeSwatchProps = {
  theme: UiThemeStyle;
};

export function ThemeSwatch({ theme }: ThemeSwatchProps) {
  return <span aria-hidden="true" {...stylex.props(styles.root, theme)} />;
}

const styles = stylex.create({
  root: {
    backdropFilter: "blur(0.5rem) saturate(1.2)",
    backgroundColor: `color-mix(in oklch, ${colors.backgroundSurface} 86%, transparent)`,
    backgroundImage: `radial-gradient(circle at 72% 78%, color-mix(in oklch, ${colors.effectThemePreviewGlow} 24%, transparent), transparent 56%), linear-gradient(145deg, color-mix(in oklch, ${colors.backgroundSurfaceRaised} 88%, transparent), color-mix(in oklch, ${colors.backgroundCanvas} 94%, transparent) 78%)`,
    borderColor: `color-mix(in oklch, ${colors.foregroundPrimary} 20%, ${colors.borderDefault})`,
    borderRadius: "50%",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: `inset 0 0.0625rem 0 color-mix(in oklch, ${colors.foregroundPrimary} 24%, transparent), inset 0 -0.5rem 0.875rem color-mix(in oklch, ${colors.backgroundCanvas} 62%, transparent), 0 0.5rem 1.125rem color-mix(in oklch, ${colors.backgroundCanvas} 52%, transparent)`,
    display: "block",
    height: "3.25rem",
    isolation: "isolate",
    outlineColor: {
      default: "transparent",
      [stylex.when.ancestor('[aria-checked="true"]')]: colors.borderAccent,
    },
    outlineOffset: "0.125rem",
    outlineStyle: "solid",
    outlineWidth: 2,
    overflow: "hidden",
    position: "relative",
    width: "3.25rem",
    "::before": {
      backgroundImage: `radial-gradient(circle at 28% 24%, color-mix(in oklch, ${colors.foregroundPrimary} 42%, transparent) 0 5%, transparent 21%), linear-gradient(122deg, ${colors.effectThemePreviewStart}, ${colors.effectThemePreviewMiddle} 48%, ${colors.effectThemePreviewEnd})`,
      borderRadius: "48% 52% 44% 56% / 34% 40% 60% 66%",
      bottom: "-18%",
      boxShadow: `inset 0 0.375rem 0.75rem color-mix(in oklch, ${colors.foregroundPrimary} 18%, transparent), 0 -0.1875rem 0.75rem color-mix(in oklch, ${colors.effectThemePreviewGlow} 34%, transparent)`,
      content: '""',
      height: "76%",
      left: "-18%",
      position: "absolute",
      transform: "rotate(-8deg)",
      width: "136%",
    },
    "::after": {
      backdropFilter: "blur(0.125rem) saturate(1.18)",
      backgroundImage: `radial-gradient(ellipse 58% 24% at 34% 18%, color-mix(in oklch, ${colors.foregroundPrimary} 56%, transparent) 0 15%, transparent 68%), linear-gradient(145deg, color-mix(in oklch, ${colors.foregroundPrimary} 10%, transparent), transparent 42%, color-mix(in oklch, ${colors.backgroundCanvas} 24%, transparent))`,
      borderRadius: "inherit",
      boxShadow: `inset 0 0 0 0.0625rem color-mix(in oklch, ${colors.foregroundPrimary} 10%, transparent)`,
      content: '""',
      inset: 0,
      position: "absolute",
    },
  },
});
