import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import type { MarkdownToJSX } from "markdown-to-jsx/react";
import type { ComponentProps, ReactNode } from "react";
import { normalizeExternalMarkdownHref } from "./markdown-link";

type ChildrenOnly = Readonly<{
  children?: ReactNode;
}>;

function MarkdownParagraph({ children }: ChildrenOnly) {
  return <p {...stylex.props(styles.paragraph)}>{children}</p>;
}

function MarkdownHeading1({ children }: ChildrenOnly) {
  return <h1 {...stylex.props(styles.heading, styles.heading1)}>{children}</h1>;
}

function MarkdownHeading2({ children }: ChildrenOnly) {
  return <h2 {...stylex.props(styles.heading, styles.heading2)}>{children}</h2>;
}

function MarkdownHeading3({ children }: ChildrenOnly) {
  return <h3 {...stylex.props(styles.heading)}>{children}</h3>;
}

function MarkdownHeading4({ children }: ChildrenOnly) {
  return <h4 {...stylex.props(styles.heading)}>{children}</h4>;
}

function MarkdownHeading5({ children }: ChildrenOnly) {
  return <h5 {...stylex.props(styles.heading)}>{children}</h5>;
}

function MarkdownHeading6({ children }: ChildrenOnly) {
  return <h6 {...stylex.props(styles.heading)}>{children}</h6>;
}

function MarkdownBlockquote({ children }: ChildrenOnly) {
  return <blockquote {...stylex.props(styles.blockquote)}>{children}</blockquote>;
}

function MarkdownUnorderedList({ children }: ChildrenOnly) {
  return <ul {...stylex.props(styles.list, styles.unorderedList)}>{children}</ul>;
}

function MarkdownOrderedList({ children, start }: ComponentProps<"ol">) {
  return (
    <ol start={start} {...stylex.props(styles.list, styles.orderedList)}>
      {children}
    </ol>
  );
}

function MarkdownListItem({ children }: ChildrenOnly) {
  return <li {...stylex.props(styles.listItem)}>{children}</li>;
}

function MarkdownLink({ children, href }: ComponentProps<"a">) {
  const externalHref = normalizeExternalMarkdownHref(href);

  if (!externalHref) {
    return <>{children}</>;
  }

  return (
    <a
      href={externalHref}
      target="_blank"
      rel="nofollow noopener noreferrer"
      {...stylex.props(styles.link)}
    >
      {children}
    </a>
  );
}

function MarkdownImage({ alt }: ComponentProps<"img">) {
  return alt ? <span {...stylex.props(styles.imageFallback)}>{alt}</span> : null;
}

function MarkdownCode({ children }: ChildrenOnly) {
  return <code {...stylex.props(styles.code)}>{children}</code>;
}

function MarkdownCodeBlock({ children }: ChildrenOnly) {
  return <pre {...stylex.props(styles.codeBlock)}>{children}</pre>;
}

function MarkdownThematicBreak() {
  return <hr {...stylex.props(styles.thematicBreak)} />;
}

function MarkdownTaskMarker({ checked }: ComponentProps<"input">) {
  return <span {...stylex.props(styles.taskMarker)}>{checked ? "[x]" : "[ ]"}</span>;
}

function MarkdownTable({ children }: ChildrenOnly) {
  return (
    <div {...stylex.props(styles.tableViewport)}>
      <table {...stylex.props(styles.table)}>{children}</table>
    </div>
  );
}

function MarkdownTableHeader({ children }: ChildrenOnly) {
  return (
    <th scope="col" {...stylex.props(styles.tableCell, styles.tableHeader)}>
      {children}
    </th>
  );
}

function MarkdownTableCell({ children }: ChildrenOnly) {
  return <td {...stylex.props(styles.tableCell)}>{children}</td>;
}

function MarkdownContainer({ children }: ChildrenOnly) {
  return <div>{children}</div>;
}

function MarkdownFootnotes({ children }: ChildrenOnly) {
  return <footer {...stylex.props(styles.footnotes)}>{children}</footer>;
}

export const markdownOverrides = {
  a: MarkdownLink,
  blockquote: MarkdownBlockquote,
  code: MarkdownCode,
  div: MarkdownContainer,
  footer: MarkdownFootnotes,
  h1: MarkdownHeading1,
  h2: MarkdownHeading2,
  h3: MarkdownHeading3,
  h4: MarkdownHeading4,
  h5: MarkdownHeading5,
  h6: MarkdownHeading6,
  hr: MarkdownThematicBreak,
  img: MarkdownImage,
  input: MarkdownTaskMarker,
  li: MarkdownListItem,
  ol: MarkdownOrderedList,
  p: MarkdownParagraph,
  pre: MarkdownCodeBlock,
  table: MarkdownTable,
  td: MarkdownTableCell,
  th: MarkdownTableHeader,
  ul: MarkdownUnorderedList,
} satisfies MarkdownToJSX.Overrides;

const focusOutline = `color-mix(in oklab, ${tokens.accent} 60%, transparent)`;

const styles = stylex.create({
  paragraph: {
    marginBlockStart: {
      default: "0.625rem",
      ":first-child": 0,
    },
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  heading: {
    fontWeight: 600,
    marginBlockStart: {
      default: "0.875rem",
      ":first-child": 0,
    },
    overflowWrap: "anywhere",
  },
  heading1: {
    fontSize: tokens.fontSizeLarge,
    lineHeight: tokens.lineHeightLarge,
  },
  heading2: {
    fontSize: tokens.fontSizeBase,
    lineHeight: tokens.lineHeightBase,
  },
  blockquote: {
    borderInlineStartColor: tokens.surfaceRaisedBorder,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 2,
    color: tokens.muted,
    marginBlockStart: {
      default: "0.75rem",
      ":first-child": 0,
    },
    paddingInlineStart: "0.75rem",
  },
  list: {
    marginBlockStart: {
      default: "0.75rem",
      ":first-child": 0,
    },
    paddingInlineStart: "1.25rem",
  },
  unorderedList: {
    listStyleType: "disc",
  },
  orderedList: {
    listStyleType: "decimal",
  },
  listItem: {
    overflowWrap: "anywhere",
  },
  link: {
    borderRadius: tokens.radiusSmall,
    color: tokens.accent,
    outlineColor: {
      default: null,
      ":focus-visible": focusOutline,
    },
    outlineOffset: {
      default: null,
      ":focus-visible": 2,
    },
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineWidth: {
      default: null,
      ":focus-visible": 1,
    },
    overflowWrap: "anywhere",
    textDecorationLine: "underline",
    textDecorationThickness: "from-font",
    textUnderlineOffset: 3,
  },
  imageFallback: {
    color: tokens.muted,
    fontStyle: "italic",
  },
  code: {
    fontFamily: tokens.fontMono,
    overflowWrap: "anywhere",
  },
  codeBlock: {
    backgroundColor: `color-mix(in oklab, ${tokens.canvas} 72%, transparent)`,
    borderRadius: tokens.radiusMedium,
    marginBlockStart: {
      default: "0.75rem",
      ":first-child": 0,
    },
    maxWidth: "100%",
    overflowX: "auto",
    padding: "0.75rem",
    whiteSpace: "pre",
  },
  thematicBreak: {
    borderBlockStartColor: tokens.surfaceRaisedBorder,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    marginBlockStart: {
      default: "0.875rem",
      ":first-child": 0,
    },
  },
  taskMarker: {
    color: tokens.muted,
    fontFamily: tokens.fontMono,
    marginInlineEnd: "0.25rem",
  },
  tableViewport: {
    marginBlockStart: {
      default: "0.75rem",
      ":first-child": 0,
    },
    maxWidth: "100%",
    overflowX: "auto",
  },
  table: {
    borderCollapse: "collapse",
    minWidth: "100%",
  },
  tableCell: {
    borderColor: tokens.surfaceRaisedBorder,
    borderStyle: "solid",
    borderWidth: 1,
    paddingBlock: "0.375rem",
    paddingInline: "0.5rem",
    textAlign: "start",
    verticalAlign: "top",
  },
  tableHeader: {
    fontWeight: 600,
  },
  footnotes: {
    borderBlockStartColor: tokens.surfaceRaisedBorder,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    color: tokens.muted,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginBlockStart: "0.875rem",
    paddingBlockStart: "0.625rem",
  },
});
