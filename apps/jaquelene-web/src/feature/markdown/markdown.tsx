import { compiler, type MarkdownToJSX } from "markdown-to-jsx/react";
import { Fragment, memo } from "react";
import { markdownOverrides } from "./markdown-elements";

type MarkdownProps = Readonly<{
  content: string;
}>;

const markdownOptions = {
  disableAutoLink: true,
  disableFrontmatter: true,
  disableParsingRawHTML: true,
  enforceAtxHeadings: true,
  evalUnserializableExpressions: false,
  forceBlock: true,
  ignoreHTMLBlocks: true,
  optimizeForStreaming: false,
  overrides: markdownOverrides,
  preserveFrontmatter: false,
  tagfilter: true,
  wrapper: Fragment,
} satisfies MarkdownToJSX.Options;

export const Markdown = memo(function Markdown({ content }: MarkdownProps) {
  return <>{compiler(content, markdownOptions)}</>;
});
