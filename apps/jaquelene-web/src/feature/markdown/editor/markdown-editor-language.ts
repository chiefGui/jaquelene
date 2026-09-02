import { markdown } from "@codemirror/lang-markdown";
import { Strikethrough, Table, TaskList } from "@lezer/markdown";

// Keep editor affordances aligned with Jaquelene's rendered Markdown policy.
// Autolinks and embedded HTML conveniences are deliberately not enabled.
export const markdownEditorLanguage = markdown({
  addKeymap: false,
  completeHTMLTags: false,
  extensions: [Strikethrough, Table, TaskList],
  pasteURLAsLink: false,
});
