import * as stylex from "@stylexjs/stylex";
import { draculaPalette } from "@jaquelene/ui/theme/dracula.stylex";
import { jaquelenePalette } from "@jaquelene/ui/theme/jaquelene.stylex";
import { describe, expect, it } from "vite-plus/test";
import { uiThemes } from "./theme";

describe("compiled UI themes", () => {
  it("emits a distinct class for each palette", () => {
    const classNames = Object.values(uiThemes).map(({ style }) => stylex.props(style).className);

    expect(classNames.every(Boolean)).toBe(true);
    expect(new Set(classNames).size).toBe(classNames.length);
  });

  it("authors every theme color in OKLCH", () => {
    const themeColors = [...Object.values(jaquelenePalette), ...Object.values(draculaPalette)];

    expect(themeColors.length).toBeGreaterThan(0);
    expect(themeColors.every((color) => color.startsWith("oklch("))).toBe(true);
  });
});
