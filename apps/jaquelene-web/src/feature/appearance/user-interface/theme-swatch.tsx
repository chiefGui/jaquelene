import { useReducedMotion } from "@jaquelene/ui/motion";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { UiThemeStyle } from "./theme";

type ThemeSwatchProps = {
  selected: boolean;
  theme: UiThemeStyle;
};

export function ThemeSwatch({ selected, theme }: ThemeSwatchProps) {
  const reducedMotion = useReducedMotion();

  return (
    <span
      aria-hidden="true"
      {...stylex.props(
        styles.root,
        theme,
        selected && styles.selected,
        !reducedMotion && styles.interactive,
      )}
    />
  );
}

const styles = stylex.create({
  root: {
    backdropFilter: "blur(0.5rem) saturate(1.2)",
    backgroundColor: `color-mix(in oklch, ${colors.surface} 86%, transparent)`,
    backgroundImage: `radial-gradient(circle at 72% 78%, color-mix(in oklch, ${colors.accent} 24%, transparent), transparent 56%), linear-gradient(145deg, color-mix(in oklch, ${colors.surfaceRaised} 88%, transparent), color-mix(in oklch, ${colors.canvas} 94%, transparent) 78%)`,
    borderColor: `color-mix(in oklch, ${colors.foreground} 20%, ${colors.surfaceRaisedBorder})`,
    borderRadius: "50%",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: `inset 0 0.0625rem 0 color-mix(in oklch, ${colors.foreground} 24%, transparent), inset 0 -0.5rem 0.875rem color-mix(in oklch, ${colors.canvas} 62%, transparent), 0 0.5rem 1.125rem color-mix(in oklch, ${colors.canvas} 52%, transparent)`,
    display: "block",
    height: "3.25rem",
    isolation: "isolate",
    outlineColor: "transparent",
    outlineOffset: "0.125rem",
    outlineStyle: "solid",
    outlineWidth: 2,
    overflow: "hidden",
    position: "relative",
    transform: "translateY(0) scale(1)",
    width: "3.25rem",
    "::before": {
      backgroundImage: `radial-gradient(circle at 28% 24%, color-mix(in oklch, ${colors.foreground} 42%, transparent) 0 5%, transparent 21%), linear-gradient(122deg, ${colors.reasoning}, ${colors.accent} 48%, ${colors.storageAppData})`,
      borderRadius: "48% 52% 44% 56% / 34% 40% 60% 66%",
      bottom: "-18%",
      boxShadow: `inset 0 0.375rem 0.75rem color-mix(in oklch, ${colors.foreground} 18%, transparent), 0 -0.1875rem 0.75rem color-mix(in oklch, ${colors.accent} 34%, transparent)`,
      content: '""',
      height: "76%",
      left: "-18%",
      position: "absolute",
      transform: "rotate(-8deg)",
      width: "136%",
    },
    "::after": {
      backdropFilter: "blur(0.125rem) saturate(1.18)",
      backgroundImage: `radial-gradient(ellipse 58% 24% at 34% 18%, color-mix(in oklch, ${colors.foreground} 56%, transparent) 0 15%, transparent 68%), linear-gradient(145deg, color-mix(in oklch, ${colors.foreground} 10%, transparent), transparent 42%, color-mix(in oklch, ${colors.canvas} 24%, transparent))`,
      borderRadius: "inherit",
      boxShadow: `inset 0 0 0 0.0625rem color-mix(in oklch, ${colors.foreground} 10%, transparent)`,
      content: '""',
      inset: 0,
      position: "absolute",
    },
  },
  selected: {
    outlineColor: colors.accent,
  },
  interactive: {
    transform: {
      default: "translateY(0) scale(1)",
      [stylex.when.ancestor(":not(:disabled):hover")]: "translateY(-0.0625rem) scale(1.025)",
      [stylex.when.ancestor("[data-focus-visible]")]: "translateY(-0.0625rem) scale(1.025)",
    },
    transitionDuration: "0.16s",
    transitionProperty: "transform",
    transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
});
