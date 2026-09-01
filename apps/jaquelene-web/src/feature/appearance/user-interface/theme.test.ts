import { UiTheme } from "@jaquelene/ipc/renderer";
import * as stylex from "@stylexjs/stylex";
import { describe, expect, it } from "vite-plus/test";
import { uiThemes } from "./theme";

describe("compiled UI themes", () => {
  it("emits a distinct class for each palette", () => {
    const jaqueleneClassName = stylex.props(uiThemes[UiTheme.Jaquelene].style).className;
    const draculaClassName = stylex.props(uiThemes[UiTheme.Dracula].style).className;

    expect(jaqueleneClassName).toBeTruthy();
    expect(draculaClassName).toBeTruthy();
    expect(draculaClassName).not.toBe(jaqueleneClassName);
  });
});
