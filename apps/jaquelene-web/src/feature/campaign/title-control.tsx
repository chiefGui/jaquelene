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
  type CampaignTitleInput,
} from "@jaquelene/domain";
import type { Campaign } from "@jaquelene/ipc/renderer";
import { Button, Field, Form as FormLayout, Input } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { useCampaignTitleFormValidation } from "./form";
import { useRenameCampaign } from "./query";

export function CampaignTitleControl({ campaign }: { campaign: Campaign }) {
  const renameCampaign = useRenameCampaign();
  const form = useFormStore({
    defaultValues: { title: campaign.title } satisfies CampaignTitleInput,
  });
  const submitting = useStoreState(form, "submitting");
  const hasSubmitted = useStoreState(
    form,
    ["submitFailed", "submitSucceed"],
    (state) => state.submitFailed > 0 || state.submitSucceed > 0,
  );
  const [error, setError] = useState<string | null>(null);

  useCampaignTitleFormValidation(form);
  useFormSubmit(form, async (state) => {
    try {
      const { title } = campaignTitleInputSchema.parse(state.values);
      const renamed = await renameCampaign.mutateAsync({ id: campaign.id, title });
      form.setValue(form.names.title, renamed.title);
    } catch (cause) {
      reportError("campaign.rename", cause);
      setError("Couldn’t rename this campaign.");
    }
  });

  return (
    <AriakitForm
      store={form}
      aria-busy={submitting || undefined}
      onSubmit={() => setError(null)}
      render={<FormLayout.Root style={styles.form} />}
      resetOnSubmit={false}
      validateOnBlur={hasSubmitted}
      validateOnChange={hasSubmitted}
    >
      <Field.Root>
        <FormLabel name={form.names.title} render={<Field.Label />}>
          Title
        </FormLabel>
        <Field.Control>
          <FormInput
            name={form.names.title}
            render={
              <Input
                type="text"
                disabled={submitting}
                maxLength={CAMPAIGN_TITLE_MAX_UTF16_LENGTH}
              />
            }
          />
          <Button type="submit" size="small" disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </Field.Control>
        <FormError name={form.names.title} render={<Field.Error />} />
      </Field.Root>
      <FormLayout.Status role={error ? "alert" : undefined} tone={error ? "danger" : "neutral"}>
        {error}
      </FormLayout.Status>
    </AriakitForm>
  );
}

const styles = stylex.create({ form: { gap: "0.5rem" } });
