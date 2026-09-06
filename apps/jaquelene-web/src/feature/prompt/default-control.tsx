import type { Prompt } from "@jaquelene/ipc/renderer";
import { Item, Switch } from "@jaquelene/ui";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useId } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { promptDefaultQuery, useSetPromptDefault } from "./query";

export function PromptDefaultControl({
  prompt,
  kindLabel,
  description,
}: {
  prompt: Prompt;
  kindLabel: string;
  description: string;
}) {
  const { data: selection } = useSuspenseQuery(promptDefaultQuery(prompt.kind));
  const setDefault = useSetPromptDefault(prompt.kind);
  const id = useId();
  let selectedKey = selection.promptKey;
  if (setDefault.isPending) selectedKey = setDefault.variables;
  let describedBy = `${id}-description`;
  if (setDefault.isError) describedBy += ` ${id}-error`;

  function changeDefault(checked: boolean) {
    let key: string | undefined;
    if (checked) key = prompt.key;
    setDefault.reset();
    setDefault.mutate(key, {
      onError(cause) {
        reportError("prompt.default.update", cause);
      },
    });
  }

  return (
    <Item.Root>
      <Item.Content>
        <Item.Label id={`${id}-label`} render={<label htmlFor={id} />}>
          Default {kindLabel}
        </Item.Label>
        <Item.Description id={`${id}-description`}>{description}</Item.Description>
        {setDefault.isError && (
          <Item.Description id={`${id}-error`} role="alert" style={styles.error}>
            Couldn't update the default {kindLabel}
          </Item.Description>
        )}
      </Item.Content>
      <Item.Value>
        <Switch
          id={id}
          aria-labelledby={`${id}-label`}
          aria-describedby={describedBy}
          aria-busy={setDefault.isPending || undefined}
          checked={selectedKey === prompt.key}
          disabled={setDefault.isPending}
          onCheckedChange={changeDefault}
        />
      </Item.Value>
    </Item.Root>
  );
}

const styles = stylex.create({ error: { color: colors.foregroundDanger } });
