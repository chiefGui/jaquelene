import { UiFont } from "@jaquelene/ipc/renderer";
import { tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { useLayoutEffect } from "react";

type UiFontDefinition = {
  label: string;
  style: StyleXStyles;
  value: UiFont;
};

const styles = stylex.create({
  geist: {
    fontFamily: tokens.fontGeist,
  },
  inter: {
    fontFamily: tokens.fontInter,
  },
  system: {
    fontFamily: tokens.fontSystem,
  },
});

export const uiFonts = {
  [UiFont.Inter]: {
    label: "Inter",
    style: styles.inter,
    value: UiFont.Inter,
  },
  [UiFont.Geist]: {
    label: "Geist",
    style: styles.geist,
    value: UiFont.Geist,
  },
  [UiFont.System]: {
    label: "System",
    style: styles.system,
    value: UiFont.System,
  },
} as const satisfies Record<UiFont, UiFontDefinition>;

export function useApplyUiFont(font: UiFont) {
  const { className } = stylex.props(uiFonts[font].style);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const classNames = className?.split(" ").filter(Boolean) ?? [];
    root.classList.add(...classNames);

    return () => root.classList.remove(...classNames);
  }, [className]);
}
