import * as stylex from "@stylexjs/stylex";

const paddingBlock = "0.5rem";

export const markdownEditorSizing = stylex.defineConsts({
  minHeight: `calc(1lh + 2 * ${paddingBlock})`,
  maxHeight: `calc(var(--markdown-editor-max-rows) * 1lh + 2 * ${paddingBlock})`,
  paddingBlock,
  paddingInline: "1rem",
});

export const markdownEditorRowSizing = stylex.create({
  rows: (maxRows: number) => ({ "--markdown-editor-max-rows": maxRows }),
});
