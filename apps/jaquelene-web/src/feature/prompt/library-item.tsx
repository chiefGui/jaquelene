import type { Prompt } from "@jaquelene/ipc/renderer";
import { Item } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

export function PromptLibraryItem({
  prompt,
  leadingAction,
  badge,
  actions,
}: {
  prompt: Prompt;
  leadingAction?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Item.Root render={<li {...stylex.props(stylex.defaultMarker())} />} style={styles.root}>
      {leadingAction}
      <div {...stylex.props(styles.content)}>
        <div {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.identity)}>
            <Item.Label render={<h3 />} style={styles.title}>
              {prompt.title}
            </Item.Label>
            {badge}
          </div>
          {actions && <div {...stylex.props(styles.actions)}>{actions}</div>}
        </div>
        <p {...stylex.props(styles.body)}>{prompt.body}</p>
      </div>
    </Item.Root>
  );
}

export const promptLibraryItemStyles = stylex.create({
  action: {
    height: "2rem",
    width: "2rem",
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
      [stylex.when.ancestor(":focus-within")]: 1,
    },
  },
});

const styles = stylex.create({
  root: { alignItems: "flex-start", gap: "0.75rem", padding: "1rem" },
  content: { flex: 1, minWidth: 0 },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    minHeight: "2rem",
  },
  identity: { display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 },
  title: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  actions: { display: "flex", alignItems: "center", flexShrink: 0, gap: "0.25rem" },
  body: {
    color: colors.foregroundSecondary,
    display: "-webkit-box",
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    margin: 0,
    marginBlockStart: "0.75rem",
    overflow: "hidden",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
  },
});
