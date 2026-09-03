import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { colors, radii, tokens } from "@jaquelene/ui/tokens.stylex";
import { tags } from "@lezer/highlight";

const editorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: colors.foregroundPrimary,
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily: "inherit",
      fontSize: tokens.fontSizeBase,
      lineHeight: tokens.lineHeightLarge,
      maxHeight: "32rem",
      minHeight: "8rem",
      overflow: "auto",
    },
    ".cm-content": {
      caretColor: colors.foregroundAccent,
      cursor: "text",
      minHeight: "8rem",
      paddingBlock: "1rem",
    },
    ".cm-line": {
      paddingInline: "1rem",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: colors.foregroundAccent,
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: `${colors.backgroundTextSelection} !important`,
    },
    ".cm-placeholder": {
      color: colors.foregroundSecondary,
      fontStyle: "normal",
    },
    ".cm-panels": {
      backgroundColor: colors.backgroundSurfaceRaised,
      color: colors.foregroundPrimary,
    },
    ".cm-panel.cm-search": {
      alignItems: "center",
      display: "flex",
      flexWrap: "wrap",
      gap: "0.375rem",
      padding: "0.5rem",
    },
    ".cm-panel.cm-search label": {
      alignItems: "center",
      display: "inline-flex",
      gap: "0.25rem",
    },
    ".cm-panel.cm-search .cm-textfield": {
      backgroundColor: colors.backgroundNeutralSubtlest,
      border: `1px solid ${colors.borderDefault}`,
      borderRadius: radii.compact,
      color: colors.foregroundPrimary,
      outline: "none",
      padding: "0.25rem 0.375rem",
    },
    ".cm-panel.cm-search .cm-textfield:focus": {
      borderColor: colors.borderFocus,
    },
    ".cm-panel.cm-search input[type=checkbox]": {
      accentColor: colors.controlAccent,
    },
    ".cm-panel.cm-search button": {
      backgroundColor: colors.buttonSoftBackground,
      border: 0,
      borderRadius: radii.compact,
      color: colors.foregroundPrimary,
      padding: "0.25rem 0.5rem",
    },
    ".cm-panel.cm-search button:hover": {
      backgroundColor: colors.buttonSoftBackgroundHover,
    },
    ".cm-panel.cm-search button[name=close]": {
      marginLeft: "auto",
    },
    ".cm-searchMatch": {
      backgroundColor: colors.backgroundSelected,
      outline: `1px solid ${colors.borderAccent}`,
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: colors.backgroundSelectedHover,
    },
  },
  { dark: true },
);

const markdownHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6],
    color: colors.foregroundPrimary,
    fontWeight: "650",
  },
  { tag: tags.heading1, fontSize: "1.2em" },
  { tag: tags.heading2, fontSize: "1.1em" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.quote, color: colors.foregroundSecondary },
  { tag: tags.list, color: colors.foregroundPrimary },
  { tag: tags.link, color: colors.foregroundLink },
  { tag: tags.url, color: colors.foregroundLink },
  {
    tag: tags.monospace,
    color: colors.foregroundPrimary,
    fontFamily: tokens.fontMono,
    fontSize: "0.94em",
  },
  { tag: tags.processingInstruction, color: colors.foregroundSecondary },
  { tag: tags.comment, color: colors.foregroundSecondary },
  { tag: tags.contentSeparator, color: colors.borderAccent },
  { tag: tags.atom, color: colors.foregroundAccent },
]);

export const markdownEditorTheme = [editorTheme, syntaxHighlighting(markdownHighlightStyle)];
