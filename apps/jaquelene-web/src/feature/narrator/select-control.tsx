import { Item } from "@jaquelene/ui";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useId, type ComponentProps } from "react";
import { PromptSelect } from "@/feature/prompt/select";

type NarratorSelectControlProps = Omit<
  ComponentProps<typeof PromptSelect>,
  "id" | "aria-labelledby" | "aria-describedby" | "footerAction"
> & { description?: string; error?: string };

export function NarratorSelectControl({
  description,
  error,
  ...props
}: NarratorSelectControlProps) {
  const controlId = useId();
  const labelId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const descriptionIds: string[] = [];
  if (description) {
    descriptionIds.push(descriptionId);
  }
  if (error) {
    descriptionIds.push(errorId);
  }
  return (
    <Item.Root
      inset="none"
      style={[styles.root, Boolean(description || error) && styles.described]}
    >
      <Item.Content style={Boolean(description) && styles.content}>
        <Item.Label id={labelId} render={<label htmlFor={controlId} />}>
          Narrator
        </Item.Label>
        {description && <Item.Description id={descriptionId}>{description}</Item.Description>}
        {error && (
          <Item.Description id={errorId} role="alert" style={styles.error}>
            {error}
          </Item.Description>
        )}
      </Item.Content>
      <PromptSelect
        {...props}
        id={controlId}
        aria-labelledby={labelId}
        {...(descriptionIds.length > 0 && { "aria-describedby": descriptionIds.join(" ") })}
        footerAction={{
          label: "Manage narrators",
          render: <Link to="/library/narrator" preload="render" />,
        }}
      />
    </Item.Root>
  );
}

const styles = stylex.create({
  root: { flexWrap: "wrap", gap: "0.75rem 1rem", minHeight: 0 },
  described: { alignItems: "flex-start" },
  content: { flex: "1 1 12rem" },
  error: { color: colors.foregroundDanger },
});
