import {
  Form as AriakitForm,
  FormError,
  FormInput,
  FormLabel,
  useFormStore,
  useFormSubmit,
} from "@ariakit/react/form";
import { useStoreState } from "@ariakit/react/store";
import {
  CAMPAIGN_TITLE_MAX_UTF16_LENGTH,
  campaignTitleInputSchema,
  narratorSkillKindKey,
  type CampaignTitleInput,
} from "@jaquelene/domain";
import type { Campaign } from "@jaquelene/ipc/renderer";
import { Button, Field, Form as FormLayout, Input } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { useCampaignTitleFormValidation } from "@/feature/campaign/form";
import { useStartCampaign } from "@/feature/campaign/query";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { skillDefaultQuery, skillPagesQuery, skillQuery } from "@/feature/skill/query";
import { SkillSelect, type SkillSelectOption } from "@/feature/skill/select";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/campaigns/new")({
  loader: async ({ context }) => {
    const defaultSelection = await context.queryClient.query(
      skillDefaultQuery(narratorSkillKindKey),
    );
    await Promise.all([
      context.queryClient.infiniteQuery({
        ...skillPagesQuery(narratorSkillKindKey),
        staleTime: "static",
      }),
      defaultSelection.skillKey
        ? context.queryClient.query(skillQuery(defaultSelection.skillKey))
        : undefined,
    ]);
  },
  component: NewCampaignRoute,
});

function NewCampaignRoute() {
  const skillPages = useSuspenseInfiniteQuery(skillPagesQuery(narratorSkillKindKey));
  const { data: defaultSelection } = useSuspenseQuery(skillDefaultQuery(narratorSkillKindKey));
  const defaultSkillKey = defaultSelection.skillKey;
  const { data: defaultSkill } = useSuspenseQuery(
    skillQuery(defaultSkillKey ?? "missing-narrator-prompt"),
  );
  const [narratorSkillKey, setNarratorSkillKey] = useState(defaultSkillKey ?? "");
  const startCampaign = useStartCampaign();
  const navigate = useNavigate({ from: "/campaigns/new" });
  const active = useRef(true);
  const form = useFormStore({ defaultValues: { title: "" } satisfies CampaignTitleInput });
  const submitting = useStoreState(form, "submitting");
  const hasSubmitted = useStoreState(
    form,
    ["submitFailed", "submitSucceed"],
    (state) => state.submitFailed > 0 || state.submitSucceed > 0,
  );
  const [createdCampaign, setCreatedCampaign] = useState<Campaign | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const narratorLabelId = useId();
  const narratorControlId = useId();

  if (!defaultSkillKey || !defaultSkill) {
    throw new Error("The narrator prompt kind has no available default.");
  }

  const loadedSkills = skillPages.data.pages.flatMap((page) => page.skills);
  const skills = loadedSkills.some(({ key }) => key === defaultSkill.key)
    ? loadedSkills
    : [defaultSkill, ...loadedSkills];
  const options = skills.map(
    (skill) =>
      ({
        description: skill.prompt,
        title: skill.title,
        value: skill.key,
      }) satisfies SkillSelectOption,
  );

  useCampaignTitleFormValidation(form);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function openCampaign(campaign: Campaign) {
    try {
      await navigate({
        to: "/campaigns/$campaignId",
        params: { campaignId: campaign.id },
        replace: true,
      });
    } catch (cause) {
      if (!active.current) {
        return;
      }

      reportError("campaign.open-created", cause);
      setOperationError("The campaign was started, but it could not be opened.");
    }
  }

  useFormSubmit(form, async (state) => {
    let campaign = createdCampaign;

    if (!campaign) {
      try {
        const { title } = campaignTitleInputSchema.parse(state.values);
        campaign = await startCampaign.mutateAsync({
          title,
          composition: [
            {
              kind: narratorSkillKindKey,
              ...(narratorSkillKey === defaultSkillKey ? {} : { skillKey: narratorSkillKey }),
            },
          ],
        });
      } catch (cause) {
        reportError("campaign.start", cause);

        if (active.current) {
          setOperationError("Could not start the campaign.");
        }
        return;
      }

      if (!active.current) {
        return;
      }

      setCreatedCampaign(campaign);
    }

    await openCampaign(campaign);
  });

  const actionLabel = createdCampaign
    ? submitting
      ? "Opening…"
      : "Open campaign"
    : submitting
      ? "Starting…"
      : "Start campaign";

  return (
    <>
      <ContentPane.Header>
        <ContentPane.HistoryBack />

        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>
              <Breadcrumb.Page id="start-campaign-page">Start campaign</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          <AriakitForm
            store={form}
            aria-busy={submitting || undefined}
            aria-labelledby="start-campaign-page"
            onSubmit={() => setOperationError(null)}
            render={<FormLayout.Root style={styles.form} />}
            resetOnSubmit={false}
            validateOnBlur={hasSubmitted}
            validateOnChange={hasSubmitted}
          >
            <Field.Root>
              <FormLabel name={form.names.title} render={<Field.Label />}>
                Title
              </FormLabel>
              <FormInput
                name={form.names.title}
                render={
                  <Input
                    type="text"
                    autoFocus
                    disabled={submitting || Boolean(createdCampaign)}
                    maxLength={CAMPAIGN_TITLE_MAX_UTF16_LENGTH}
                    placeholder="Campaign title"
                  />
                }
              />
              <FormError name={form.names.title} render={<Field.Error />} />
            </Field.Root>

            <Field.Root>
              <Field.Label id={narratorLabelId} htmlFor={narratorControlId}>
                Narrator
              </Field.Label>
              <SkillSelect
                id={narratorControlId}
                aria-labelledby={narratorLabelId}
                disabled={submitting || Boolean(createdCampaign)}
                hasMore={skillPages.hasNextPage}
                loadingMore={skillPages.isFetchingNextPage}
                onLoadMore={() => void skillPages.fetchNextPage()}
                value={narratorSkillKey}
                options={options}
                onValueChange={setNarratorSkillKey}
              />
            </Field.Root>

            <FormLayout.Status
              role={operationError ? "alert" : undefined}
              tone={operationError ? "danger" : "neutral"}
            >
              {operationError}
            </FormLayout.Status>

            <Button type="submit" disabled={submitting} style={styles.submitButton}>
              {actionLabel}
            </Button>
          </AriakitForm>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  form: { maxWidth: "34rem" },
  submitButton: { justifySelf: "start", minWidth: "8rem" },
});
