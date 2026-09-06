import {
  Form as AriakitForm,
  FormControl,
  FormDescription,
  FormError,
  FormInput,
  FormLabel,
  useFormStore,
  useFormSubmit,
  useFormValue,
} from "@ariakit/react/form";
import { useStoreState } from "@ariakit/react/store";
import {
  CAMPAIGN_SCENARIO_MAX_UTF16_LENGTH,
  CAMPAIGN_TITLE_MAX_UTF16_LENGTH,
  campaignSetupInputSchema,
  type CampaignSetupInput,
  narratorPromptKindKey,
} from "@jaquelene/domain";
import type { Campaign } from "@jaquelene/ipc/renderer";
import { Button, Field, Form as FormLayout, Input, Item } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useStartCampaignFormValidation } from "@/feature/campaign/form";
import { MarkdownEditor } from "@/feature/markdown/editor/markdown-editor";
import { ScenarioImportControl } from "@/feature/scenario/import-control";
import { useStartCampaign } from "@/feature/campaign/query";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { promptDefaultQuery, promptPagesQuery, promptQuery } from "@/feature/prompt/query";
import type { PromptSelectOption } from "@/feature/prompt/select";
import { NarratorSelectControl } from "@/feature/narrator/select-control";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/campaigns/new")({
  loader: async ({ context }) => {
    const defaultSelection = await context.queryClient.query(
      promptDefaultQuery(narratorPromptKindKey),
    );
    await Promise.all([
      context.queryClient.infiniteQuery({
        ...promptPagesQuery(narratorPromptKindKey),
        staleTime: "static",
      }),
      defaultSelection.promptKey
        ? context.queryClient.query(promptQuery(defaultSelection.promptKey))
        : undefined,
    ]);
  },
  component: NewCampaignRoute,
});

function NewCampaignRoute() {
  const promptPages = useSuspenseInfiniteQuery(promptPagesQuery(narratorPromptKindKey));
  const { data: defaultSelection } = useSuspenseQuery(promptDefaultQuery(narratorPromptKindKey));
  const defaultPromptKey = defaultSelection.promptKey;
  const { data: defaultPrompt } = useSuspenseQuery(
    promptQuery(defaultPromptKey ?? "missing-narrator-prompt"),
  );
  const [narratorPromptKey, setNarratorPromptKey] = useState(defaultPromptKey ?? "");
  const startCampaign = useStartCampaign();
  const navigate = useNavigate({ from: "/campaigns/new" });
  const active = useRef(true);
  const form = useFormStore({
    defaultValues: { title: "", scenario: "" } satisfies CampaignSetupInput,
  });
  const scenario = useFormValue<string>(form, form.names.scenario);
  const submitting = useStoreState(form, "submitting");
  const hasSubmitted = useStoreState(
    form,
    ["submitFailed", "submitSucceed"],
    (state) => state.submitFailed > 0 || state.submitSucceed > 0,
  );
  const [createdCampaign, setCreatedCampaign] = useState<Campaign | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  if (!defaultPromptKey || !defaultPrompt) {
    throw new Error("The narrator prompt kind has no available default.");
  }

  const loadedPrompts = promptPages.data.pages.flatMap((page) => page.prompts);
  const prompts = loadedPrompts.some(({ key }) => key === defaultPrompt.key)
    ? loadedPrompts
    : [defaultPrompt, ...loadedPrompts];
  const options = prompts.map(
    (prompt) =>
      ({
        description: prompt.body,
        title: prompt.title,
        value: prompt.key,
      }) satisfies PromptSelectOption,
  );

  useStartCampaignFormValidation(form);

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
        const { title, scenario } = campaignSetupInputSchema.parse(state.values);
        campaign = await startCampaign.mutateAsync({
          title,
          scenario,
          composition: [
            {
              kind: narratorPromptKindKey,
              ...(narratorPromptKey === defaultPromptKey ? {} : { promptKey: narratorPromptKey }),
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
            <Item.Group>
              <Item.Root style={styles.controlField}>
                <Field.Root style={styles.titleRow}>
                  <Item.Content>
                    <FormLabel name={form.names.title} render={<Field.Label />}>
                      Title
                    </FormLabel>
                    <FormDescription name={form.names.title} render={<Item.Description />}>
                      Helps you find this campaign later.
                      <br />
                      It doesn't affect the story.
                    </FormDescription>
                  </Item.Content>
                  <FormInput
                    name={form.names.title}
                    render={
                      <Input
                        type="text"
                        autoFocus
                        disabled={submitting || Boolean(createdCampaign)}
                        maxLength={CAMPAIGN_TITLE_MAX_UTF16_LENGTH}
                        placeholder="e.g. The Last Kingdom"
                        style={styles.titleInput}
                      />
                    }
                  />
                  <FormError
                    name={form.names.title}
                    render={<Field.Error style={styles.titleError} />}
                  />
                </Field.Root>
              </Item.Root>

              <Item.Root style={styles.writingField}>
                <Field.Root>
                  <FormLabel name={form.names.scenario} render={<Field.Label />}>
                    Scenario
                  </FormLabel>
                  <FormDescription
                    name={form.names.scenario}
                    render={<Field.Description style={styles.scenarioDescription} />}
                  >
                    Define the setting, universe, flavor, and other permanent details of this
                    campaign.
                    <br />
                    Think of aesthetics, important characters, public facts, and settings like New
                    York in 1920.
                  </FormDescription>
                  <FormControl
                    name={form.names.scenario}
                    render={
                      <MarkdownEditor
                        value={scenario}
                        toolbarActions={<ScenarioImportControl />}
                        onValueChange={(value) => form.setValue(form.names.scenario, value)}
                        maxLength={CAMPAIGN_SCENARIO_MAX_UTF16_LENGTH}
                        readOnly={submitting || Boolean(createdCampaign)}
                        placeholder="New York, December 1, 2026. Cyberpunk."
                      />
                    }
                  />
                  <FormError name={form.names.scenario} render={<Field.Error />} />
                </Field.Root>
              </Item.Root>

              <Item.Root style={styles.controlField}>
                <NarratorSelectControl
                  description="Set the rules for narration. Avoid worldbuilding and character details. Keep it concise."
                  disabled={submitting || Boolean(createdCampaign)}
                  hasMore={promptPages.hasNextPage}
                  loadingMore={promptPages.isFetchingNextPage}
                  onLoadMore={() => void promptPages.fetchNextPage()}
                  value={narratorPromptKey}
                  options={options}
                  onValueChange={setNarratorPromptKey}
                />
              </Item.Root>
            </Item.Group>

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
  form: { gap: "1.5rem" },
  writingField: { display: "block", paddingBlock: "1.5rem" },
  controlField: { display: "block", paddingBlock: "1rem" },
  titleRow: {
    display: "grid",
    alignItems: "start",
    gridTemplateColumns: "minmax(4rem, 1fr) minmax(0, 20rem)",
    columnGap: "1rem",
  },
  titleInput: { minWidth: 0, width: "100%" },
  titleError: { gridColumn: "2" },
  scenarioDescription: { margin: 0, marginBlockEnd: "0.25rem" },
  submitButton: { alignSelf: "flex-end", width: "fit-content", minWidth: "8rem" },
});
