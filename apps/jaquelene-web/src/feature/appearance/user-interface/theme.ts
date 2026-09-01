import { UiTheme } from "@jaquelene/ipc/renderer";
import { draculaPalette } from "@jaquelene/ui/theme/dracula.stylex";
import { jaquelenePalette } from "@jaquelene/ui/theme/jaquelene.stylex";
import { colors, type ThemePalette } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect } from "react";

// StyleX only extracts themes from a statically visible object literal.
const jaqueleneTheme = stylex.createTheme(colors, {
  canvas: jaquelenePalette.canvas,
  surface: jaquelenePalette.surface,
  surfaceRaised: jaquelenePalette.surfaceRaised,
  border: jaquelenePalette.border,
  surfaceRaisedBorder: jaquelenePalette.surfaceRaisedBorder,
  backdrop: jaquelenePalette.backdrop,
  foreground: jaquelenePalette.foreground,
  muted: jaquelenePalette.muted,
  accent: jaquelenePalette.accent,
  danger: jaquelenePalette.danger,
  success: jaquelenePalette.success,
  reasoning: jaquelenePalette.reasoning,
  storageContent: jaquelenePalette.storageContent,
  storageCache: jaquelenePalette.storageCache,
  storageAppData: jaquelenePalette.storageAppData,
  storageLogs: jaquelenePalette.storageLogs,
  composerGlowStart: jaquelenePalette.composerGlowStart,
  composerGlowFirstBlend: jaquelenePalette.composerGlowFirstBlend,
  composerGlowSecondBlend: jaquelenePalette.composerGlowSecondBlend,
  composerGlowEnd: jaquelenePalette.composerGlowEnd,
} satisfies ThemePalette);
const draculaTheme = stylex.createTheme(colors, {
  canvas: draculaPalette.canvas,
  surface: draculaPalette.surface,
  surfaceRaised: draculaPalette.surfaceRaised,
  border: draculaPalette.border,
  surfaceRaisedBorder: draculaPalette.surfaceRaisedBorder,
  backdrop: draculaPalette.backdrop,
  foreground: draculaPalette.foreground,
  muted: draculaPalette.muted,
  accent: draculaPalette.accent,
  danger: draculaPalette.danger,
  success: draculaPalette.success,
  reasoning: draculaPalette.reasoning,
  storageContent: draculaPalette.storageContent,
  storageCache: draculaPalette.storageCache,
  storageAppData: draculaPalette.storageAppData,
  storageLogs: draculaPalette.storageLogs,
  composerGlowStart: draculaPalette.composerGlowStart,
  composerGlowFirstBlend: draculaPalette.composerGlowFirstBlend,
  composerGlowSecondBlend: draculaPalette.composerGlowSecondBlend,
  composerGlowEnd: draculaPalette.composerGlowEnd,
} satisfies ThemePalette);

type UiThemeDefinition = {
  label: string;
  style: typeof draculaTheme;
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
    accentColor: colors.accent,
    backgroundColor: colors.canvas,
    colorScheme: "dark",
    scrollbarColor: `color-mix(in oklch, ${colors.muted} 65%, transparent) transparent`,
    "::selection": {
      backgroundColor: `color-mix(in oklch, ${colors.accent} 35%, transparent)`,
      color: colors.foreground,
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
