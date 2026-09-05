import {
  campaignSkillSelectionQuery,
  useSetCampaignSkillSelection,
} from "@/feature/campaign/skills-query";
import { narratorSkillKindKey } from "@jaquelene/domain";
import { Item } from "@jaquelene/ui";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  usePrefetchInfiniteQuery,
  usePrefetchQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { SkillSelect, type SkillSelectOption } from "@/feature/skill/select";
import {
  skillDefaultQuery,
  skillPagesQuery,
  skillQuery,
  useIsSkillDefaultPending,
} from "@/feature/skill/query";

export function CampaignNarratorControl({ campaignId }: { campaignId: string }) {
  // Start independent queries before the campaign selection suspends this render.
  usePrefetchInfiniteQuery(skillPagesQuery(narratorSkillKindKey));
  usePrefetchQuery(skillDefaultQuery(narratorSkillKindKey));
  const { data: selection } = useSuspenseQuery(
    campaignSkillSelectionQuery(campaignId, narratorSkillKindKey),
  );

  if (!selection) {
    throw new Error(`Campaign "${campaignId}" is unavailable.`);
  }

  if (!selection.effectiveSkillKey) {
    throw new Error(`Campaign "${campaignId}" has no available narrator prompt.`);
  }

  return (
    <NarratorSelectionControl
      campaignId={campaignId}
      effectiveSkillKey={selection.effectiveSkillKey}
    />
  );
}

function NarratorSelectionControl({
  campaignId,
  effectiveSkillKey,
}: {
  campaignId: string;
  effectiveSkillKey: string;
}) {
  const { data: effectiveSkill } = useSuspenseQuery(skillQuery(effectiveSkillKey));
  const skillPages = useSuspenseInfiniteQuery(skillPagesQuery(narratorSkillKindKey));
  const { data: defaultSelection } = useSuspenseQuery(skillDefaultQuery(narratorSkillKindKey));
  const setSelection = useSetCampaignSkillSelection(campaignId, narratorSkillKindKey);
  const defaultPending = useIsSkillDefaultPending(narratorSkillKindKey);
  const controlId = useId();
  const labelId = useId();
  const errorId = useId();

  if (!effectiveSkill) {
    throw new Error(`Campaign "${campaignId}" has no available narrator prompt.`);
  }

  const skills = skillPages.data.pages.flatMap((page) => page.skills);
  let availableSkills = skills;
  if (!skills.some(({ key }) => key === effectiveSkill.key)) {
    availableSkills = [effectiveSkill, ...skills];
  }
  const options = availableSkills.map(
    (skill) =>
      ({
        description: skill.prompt,
        title: skill.title,
        value: skill.key,
      }) satisfies SkillSelectOption,
  );

  return (
    <Item.Root inset="none" style={styles.root}>
      <Item.Content>
        <Item.Label id={labelId} render={<label htmlFor={controlId} />}>
          Narrator
        </Item.Label>
        {setSelection.isError && (
          <Item.Description id={errorId} role="alert" style={styles.error}>
            Couldn't save the narrator.
          </Item.Description>
        )}
      </Item.Content>

      <SkillSelect
        id={controlId}
        aria-labelledby={labelId}
        {...(setSelection.isError && { "aria-describedby": errorId })}
        busy={setSelection.isPending || defaultPending}
        footerAction={{
          label: "Manage narrator",
          render: <Link to="/library/narrator" preload="render" />,
        }}
        hasMore={skillPages.hasNextPage}
        loadingMore={skillPages.isFetchingNextPage}
        onLoadMore={() => void skillPages.fetchNextPage()}
        value={effectiveSkillKey}
        options={options}
        onValueChange={(skillKey) => {
          setSelection.reset();
          let selectedSkillKey: string | undefined = skillKey;
          if (skillKey === defaultSelection.skillKey) selectedSkillKey = undefined;
          setSelection.mutate(selectedSkillKey, {
            onError(cause) {
              reportError("campaign.narrator.update", cause);
            },
          });
        }}
      />
    </Item.Root>
  );
}

const styles = stylex.create({
  root: {
    flexWrap: "wrap",
    gap: "0.75rem 1rem",
    minHeight: 0,
  },
  error: { color: colors.foregroundDanger },
});
