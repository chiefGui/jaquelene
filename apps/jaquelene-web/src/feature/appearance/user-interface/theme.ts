import { UiTheme } from "@jaquelene/ipc/renderer";
import { draculaTheme, tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect } from "react";

type UiThemeDefinition = {
  label: string;
  style: typeof draculaTheme | undefined;
  value: UiTheme;
};

export const uiThemes = {
  [UiTheme.Jaquelene]: {
    label: "Jaquelene",
    style: undefined,
    value: UiTheme.Jaquelene,
  },
  [UiTheme.Dracula]: {
    label: "Dracula",
    style: draculaTheme,
    value: UiTheme.Dracula,
  },
} as const satisfies Record<UiTheme, UiThemeDefinition>;

const styles = stylex.create({
  document: {
    accentColor: tokens.accent,
    backgroundColor: tokens.canvas,
    colorScheme: "dark",
    scrollbarColor: `color-mix(in oklch, ${tokens.muted} 65%, transparent) transparent`,
    "::selection": {
      backgroundColor: `color-mix(in oklch, ${tokens.accent} 35%, transparent)`,
      color: tokens.foreground,
    },
  },
});

export function useApplyUiTheme(theme: UiTheme) {
  const { className } = stylex.props(styles.document, uiThemes[theme].style);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = root.dataset.theme;
    const previousThemeColor = themeColor?.content;
    const classNames = className?.split(" ").filter(Boolean) ?? [];

    root.classList.add(...classNames);
    root.dataset.theme = theme;

    if (themeColor) {
      themeColor.content = getComputedStyle(root).backgroundColor;
    }

    return () => {
      root.classList.remove(...classNames);

      if (previousTheme === undefined) {
        delete root.dataset.theme;
      } else {
        root.dataset.theme = previousTheme;
      }

      if (themeColor && previousThemeColor !== undefined) {
        themeColor.content = previousThemeColor;
      }
    };
  }, [className, theme]);
}
