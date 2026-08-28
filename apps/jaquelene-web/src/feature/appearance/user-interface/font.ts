import { UiFont } from "@jaquelene/ipc/renderer";
import { useLayoutEffect } from "react";

type UiFontDefinition = {
  className: string;
  label: string;
  value: UiFont;
};

export const uiFonts = {
  [UiFont.Inter]: {
    className: "font-sans",
    label: "Inter",
    value: UiFont.Inter,
  },
  [UiFont.Geist]: {
    className: "font-geist",
    label: "Geist",
    value: UiFont.Geist,
  },
  [UiFont.System]: {
    className: "font-system",
    label: "System",
    value: UiFont.System,
  },
} as const satisfies Record<UiFont, UiFontDefinition>;

export function useApplyUiFont(font: UiFont) {
  const className = uiFonts[font].className;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add(className);

    return () => root.classList.remove(className);
  }, [className]);
}
