import * as stylex from "@stylexjs/stylex";

// Bounds include the existing 1rem padding above and below the text.
export const markdownEditorSizing = stylex.defineConsts({
  minHeight: "calc(1lh + 2rem)",
  maxHeight: "calc(5lh + 2rem)",
  padding: "1rem",
});
