import * as stylex from "@stylexjs/stylex";

const padding = "1rem";

export const markdownEditorSizing = stylex.defineConsts({
  minHeight: `calc(1lh + 2 * ${padding})`,
  maxHeight: `calc(5lh + 2 * ${padding})`,
  padding,
});
