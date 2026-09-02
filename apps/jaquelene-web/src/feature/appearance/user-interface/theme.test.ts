import * as stylex from "@stylexjs/stylex";
import { describe, expect, it } from "vite-plus/test";
import { uiThemes } from "./theme";

describe("compiled UI themes", () => {
  it("emits a distinct class for each theme", () => {
    const classNames = Object.values(uiThemes).map(({ style }) => stylex.props(style).className);

    expect(classNames.every(Boolean)).toBe(true);
    expect(new Set(classNames).size).toBe(classNames.length);
  });
});
