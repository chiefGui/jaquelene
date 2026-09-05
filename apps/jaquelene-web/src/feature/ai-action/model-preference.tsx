import { Button, Item } from "@jaquelene/ui";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { ModelPicker } from "@/feature/model/picker";
import { aiActionModelQuery, useSetAiActionModel } from "./query";

export function AiActionModelPreference() {
  const controlId = useId();
  const labelId = useId();
  const descriptionId = useId();
  const { data: model } = useSuspenseQuery(aiActionModelQuery);
  const selection = useSetAiActionModel();
  return (
    <Item.Section aria-labelledby={`${labelId}-heading`}>
      <Item.Heading id={`${labelId}-heading`}>AI actions</Item.Heading>
      <Item.Group>
        <Item.Root>
          <Item.Content>
            <Item.Label id={labelId} render={<label htmlFor={controlId} />}>
              Model
            </Item.Label>
            <Item.Description id={descriptionId}>
              Used for editor actions, independently of campaigns.
            </Item.Description>
            {selection.isError && (
              <Item.Description role="alert" style={styles.error}>
                Couldn't save the AI action model. Try again.
              </Item.Description>
            )}
          </Item.Content>
          <Item.Value>
            <ModelPicker.Root value={model} onValueChange={(next) => selection.mutate(next)}>
              <ModelPicker.Trigger
                id={controlId}
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
                disabled={selection.isPending}
              />
              <ModelPicker.Empty>
                <Button render={<Link to="/settings/providers" replace />}>
                  Connect a provider
                </Button>
              </ModelPicker.Empty>
              <ModelPicker.Content />
            </ModelPicker.Root>
            <Button
              type="button"
              variant="ghost"
              disabled={!model || selection.isPending}
              onClick={() => selection.mutate(null)}
            >
              Clear
            </Button>
          </Item.Value>
        </Item.Root>
      </Item.Group>
    </Item.Section>
  );
}

const styles = stylex.create({ error: { color: colors.foregroundDanger } });
