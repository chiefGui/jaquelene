import { UiTheme } from "@jaquelene/ipc/renderer";
import { draculaTheme } from "@jaquelene/ui/theme/dracula";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect } from "react";

// An empty theme resets a subtree to the defaults declared by colors.
const jaqueleneTheme = stylex.createTheme(colors, {});

export type UiThemeStyle = typeof jaqueleneTheme;

type UiThemeDefinition = {
  label: string;
  style: UiThemeStyle;
  value: UiTheme;
};

export const uiThemes = {
  [UiTheme.Jaquelene]: {
    label: "Jaquelene",
    style: jaqueleneTheme,
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
    accentColor: colors.controlAccent,
    backgroundColor: colors.backgroundCanvas,
    colorScheme: "dark",
    scrollbarColor: `${colors.foregroundDisabled} transparent`,
    "::selection": {
      backgroundColor: colors.backgroundTextSelection,
      color: colors.foregroundTextSelection,
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
