import { narratorSkillKindKey } from "@jaquelene/domain";
import type { CustomSkill } from "@jaquelene/ipc/renderer";
import { Item, Switch } from "@jaquelene/ui";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useId } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { skillDefaultQuery, useSetSkillDefault } from "@/feature/skill/query";
import { NarratorSkillDeleteAction } from "./delete-action";

type NarratorSkillManagementProps = {
  onDeleted: () => Promise<void>;
  skill: CustomSkill;
};

export function NarratorSkillManagement({ onDeleted, skill }: NarratorSkillManagementProps) {
  const { data: defaultSelection } = useSuspenseQuery(skillDefaultQuery(narratorSkillKindKey));
  const setDefault = useSetSkillDefault(narratorSkillKindKey);
  const defaultLabelId = useId();
  const defaultDescriptionId = useId();
  const defaultErrorId = useId();
  const isDefault = defaultSelection.skillKey === skill.key;

  function changeDefault(checked: boolean) {
    setDefault.reset();
    setDefault.mutate(checked ? skill.key : undefined, {
      onError(cause) {
        reportError("skill.default.update", cause);
      },
    });
  }

  return (
    <Item.Group aria-label="Narrator prompt management">
      <Item.Root>
        <Item.Content>
          <Item.Label id={defaultLabelId} render={<label htmlFor={`${defaultLabelId}-control`} />}>
            Default narrator
          </Item.Label>
          <Item.Description id={defaultDescriptionId}>
            The narrator selected by default for new campaigns.
          </Item.Description>
          {setDefault.isError ? (
            <Item.Description id={defaultErrorId} role="alert" style={styles.error}>
              Couldn't update the default narrator
            </Item.Description>
          ) : null}
        </Item.Content>

        <Item.Value>
          <Switch
            id={`${defaultLabelId}-control`}
            aria-labelledby={defaultLabelId}
            aria-describedby={
              setDefault.isError
                ? `${defaultDescriptionId} ${defaultErrorId}`
                : defaultDescriptionId
            }
            aria-busy={setDefault.isPending || undefined}
            checked={isDefault}
            disabled={setDefault.isPending}
            onCheckedChange={changeDefault}
          />
        </Item.Value>
      </Item.Root>

      <Item.Root>
        <Item.Content>
          <Item.Label>Delete</Item.Label>
          <Item.Description>Permanently remove this narrator prompt.</Item.Description>
        </Item.Content>

        <NarratorSkillDeleteAction isDefault={isDefault} onDeleted={onDeleted} skill={skill} />
      </Item.Root>
    </Item.Group>
  );
}

const styles = stylex.create({
  error: { color: colors.foregroundDanger },
});
