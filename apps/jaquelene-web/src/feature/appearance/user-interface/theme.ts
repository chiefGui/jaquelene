import { UiTheme } from "@jaquelene/ipc/renderer";
import { draculaPalette } from "@jaquelene/ui/theme/dracula.stylex";
import { jaquelenePalette } from "@jaquelene/ui/theme/jaquelene.stylex";
import { colors, type ThemePalette } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect } from "react";

// StyleX only extracts themes from a statically visible object literal.
const jaqueleneTheme = stylex.createTheme(colors, {
  backgroundCanvas: jaquelenePalette.backgroundCanvas,
  backgroundSurface: jaquelenePalette.backgroundSurface,
  backgroundRaised: jaquelenePalette.backgroundRaised,
  backgroundFloating: jaquelenePalette.backgroundFloating,
  backgroundOverlay: jaquelenePalette.backgroundOverlay,
  backgroundSubtle: jaquelenePalette.backgroundSubtle,
  backgroundSubtleHover: jaquelenePalette.backgroundSubtleHover,
  backgroundSubtlePressed: jaquelenePalette.backgroundSubtlePressed,
  foregroundPrimary: jaquelenePalette.foregroundPrimary,
  foregroundSecondary: jaquelenePalette.foregroundSecondary,
  foregroundDisabled: jaquelenePalette.foregroundDisabled,
  foregroundOnInteractive: jaquelenePalette.foregroundOnInteractive,
  borderSubtle: jaquelenePalette.borderSubtle,
  borderDefault: jaquelenePalette.borderDefault,
  borderFocus: jaquelenePalette.borderFocus,
  borderDanger: jaquelenePalette.borderDanger,
  borderDangerStrong: jaquelenePalette.borderDangerStrong,
  focusRing: jaquelenePalette.focusRing,
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
  danger: jaquelenePalette.danger,
  dangerSurface: jaquelenePalette.dangerSurface,
  dangerSurfaceHover: jaquelenePalette.dangerSurfaceHover,
  dangerSolid: jaquelenePalette.dangerSolid,
  dangerSolidHover: jaquelenePalette.dangerSolidHover,
  foregroundOnDanger: jaquelenePalette.foregroundOnDanger,
  success: jaquelenePalette.success,
  reasoning: jaquelenePalette.reasoning,
  reasoningSurface: jaquelenePalette.reasoningSurface,
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
  backgroundCanvas: draculaPalette.backgroundCanvas,
  backgroundSurface: draculaPalette.backgroundSurface,
  backgroundRaised: draculaPalette.backgroundRaised,
  backgroundFloating: draculaPalette.backgroundFloating,
  backgroundOverlay: draculaPalette.backgroundOverlay,
  backgroundSubtle: draculaPalette.backgroundSubtle,
  backgroundSubtleHover: draculaPalette.backgroundSubtleHover,
  backgroundSubtlePressed: draculaPalette.backgroundSubtlePressed,
  foregroundPrimary: draculaPalette.foregroundPrimary,
  foregroundSecondary: draculaPalette.foregroundSecondary,
  foregroundDisabled: draculaPalette.foregroundDisabled,
  foregroundOnInteractive: draculaPalette.foregroundOnInteractive,
  borderSubtle: draculaPalette.borderSubtle,
  borderDefault: draculaPalette.borderDefault,
  borderFocus: draculaPalette.borderFocus,
  borderDanger: draculaPalette.borderDanger,
  borderDangerStrong: draculaPalette.borderDangerStrong,
  focusRing: draculaPalette.focusRing,
  accent: draculaPalette.accent,
  backgroundSelected: draculaPalette.backgroundSelected,
  backgroundSelectedHover: draculaPalette.backgroundSelectedHover,
  link: draculaPalette.link,
  linkHover: draculaPalette.linkHover,
  selectionBackground: draculaPalette.selectionBackground,
  selectionForeground: draculaPalette.selectionForeground,
  actionPrimary: draculaPalette.actionPrimary,
  actionPrimaryHover: draculaPalette.actionPrimaryHover,
  actionPrimaryForeground: draculaPalette.actionPrimaryForeground,
  controlChecked: draculaPalette.controlChecked,
  controlCheckedBorder: draculaPalette.controlCheckedBorder,
  danger: draculaPalette.danger,
  dangerSurface: draculaPalette.dangerSurface,
  dangerSurfaceHover: draculaPalette.dangerSurfaceHover,
  dangerSolid: draculaPalette.dangerSolid,
  dangerSolidHover: draculaPalette.dangerSolidHover,
  foregroundOnDanger: draculaPalette.foregroundOnDanger,
  success: draculaPalette.success,
  reasoning: draculaPalette.reasoning,
  reasoningSurface: draculaPalette.reasoningSurface,
  storageContent: draculaPalette.storageContent,
  storageCache: draculaPalette.storageCache,
  storageAppData: draculaPalette.storageAppData,
  storageLogs: draculaPalette.storageLogs,
  composerGlowStart: draculaPalette.composerGlowStart,
  composerGlowFirstBlend: draculaPalette.composerGlowFirstBlend,
  composerGlowSecondBlend: draculaPalette.composerGlowSecondBlend,
  composerGlowEnd: draculaPalette.composerGlowEnd,
} satisfies ThemePalette);

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
    accentColor: colors.accent,
    backgroundColor: colors.backgroundCanvas,
    colorScheme: "dark",
    scrollbarColor: `${colors.foregroundDisabled} transparent`,
    "::selection": {
      backgroundColor: colors.selectionBackground,
      color: colors.selectionForeground,
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
