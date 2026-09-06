import type { ModelSelection } from "@jaquelene/ipc/renderer";
import { Item } from "@jaquelene/ui";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";
import { ModelPicker } from "./picker";

export function DefaultModelSetting({
  description,
  model,
  pending,
  error,
  onSelect,
}: Readonly<{
  description: string;
  model: ModelSelection | null;
  pending: boolean;
  error: boolean;
  onSelect: (model: ModelSelection) => void;
}>) {
  const controlId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const labelId = useId();
  let describedBy = descriptionId;
  if (error) {
    describedBy = `${descriptionId} ${errorId}`;
  }

  return (
    <Item.Root>
      <Item.Content>
        <Item.Label id={labelId} render={<label htmlFor={controlId} />}>
          Default model
        </Item.Label>
        <Item.Description id={descriptionId}>{description}</Item.Description>
        {error && (
          <Item.Description id={errorId} role="alert" style={styles.error}>
            Couldn't save the default model.
          </Item.Description>
        )}
      </Item.Content>
      <Item.Value>
        <ModelPicker.Root value={model} onValueChange={onSelect}>
          <ModelPicker.Trigger
            id={controlId}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            disabled={pending}
          />
          <ModelPicker.Content />
        </ModelPicker.Root>
      </Item.Value>
    </Item.Root>
  );
}

const styles = stylex.create({ error: { color: colors.foregroundDanger } });
