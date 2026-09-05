import { Form as AriakitForm, FormError, FormInput, useFormStore } from "@ariakit/react/form";
import { useStoreState } from "@ariakit/react/store";
import {
  CAMPAIGN_TITLE_MAX_UTF16_LENGTH,
  campaignTitleInputSchema,
  type CampaignTitleInput,
} from "@jaquelene/domain";
import type { Campaign } from "@jaquelene/ipc/renderer";
import { Button, Field, Input } from "@jaquelene/ui";
import { colors, radii, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useRef, useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { formatCampaignTitleIssue } from "./form";
import { useRenameCampaign } from "./query";
import { limitCampaignTitleInput } from "./title-input";

export function CampaignTitleControl({ campaign }: { campaign: Campaign }) {
  const renameCampaign = useRenameCampaign(campaign.id);
  const form = useFormStore({
    defaultValues: { title: campaign.title } satisfies CampaignTitleInput,
  });
  const submitting = useStoreState(form, "submitting");
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const composing = useRef(false);

  useLayoutEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus();
    }
  }, [editing]);

  function beginEditing() {
    form.setValue(form.names.title, campaign.title);
    form.setError(form.names.title, undefined);
    setEditing(true);
  }

  function finishEditing() {
    restoreFocus.current = document.activeElement === input.current;
    setEditing(false);
  }

  function cancelEditing() {
    if (form.getState().submitting) return;
    form.setValue(form.names.title, campaign.title);
    form.setError(form.names.title, undefined);
    finishEditing();
  }

  function updateTitle(element: HTMLInputElement) {
    if (!composing.current) {
      const limited = limitCampaignTitleInput(
        element.value,
        element.selectionStart ?? element.value.length,
      );
      if (limited.value !== element.value) {
        element.value = limited.value;
        element.setSelectionRange(limited.caret, limited.caret);
      }
    }
    form.setValue(form.names.title, element.value);
    form.setError(form.names.title, undefined);
  }

  async function saveTitle() {
    if (composing.current || form.getState().submitting) return;
    form.setFieldTouched(form.names.title, true);
    const result = campaignTitleInputSchema.safeParse(form.getState().values);

    if (!result.success) {
      form.setError(form.names.title, formatCampaignTitleIssue(result.error.issues[0]!));
      return;
    }

    form.setError(form.names.title, undefined);
    const { title } = result.data;
    if (title === campaign.title) {
      form.setValue(form.names.title, title);
      finishEditing();
      return;
    }

    // Start the write in the event so navigating away cannot cancel the blur save.
    form.setState("submitting", true);
    try {
      const renamed = await renameCampaign.mutateAsync(title);
      form.setValue(form.names.title, renamed.title);
      finishEditing();
    } catch (cause) {
      reportError("campaign.rename", cause);
      form.setError(form.names.title, "Couldn't save the title. Try again.");
    } finally {
      form.setState("submitting", false);
    }
  }

  return (
    <AriakitForm
      store={form}
      aria-busy={submitting || undefined}
      aria-label="Rename campaign"
      {...stylex.props(styles.form)}
      resetOnSubmit={false}
      validateOnBlur={false}
      validateOnChange={false}
      autoFocusOnSubmit={false}
      onSubmit={(event) => {
        event.preventDefault();
        void saveTitle();
      }}
    >
      <h1 aria-label={campaign.title} {...stylex.props(styles.heading)}>
        {!editing && (
          <Button
            ref={trigger}
            type="button"
            variant="ghost"
            aria-label={`Rename campaign: ${campaign.title}`}
            onClick={beginEditing}
            style={styles.trigger}
          >
            <Button.Label style={styles.title}>{campaign.title}</Button.Label>
          </Button>
        )}
        {editing && (
          <FormInput
            aria-label="Campaign title"
            name={form.names.title}
            onBlur={(event) => {
              if (composing.current) {
                composing.current = false;
                updateTitle(event.currentTarget);
              }
              void saveTitle();
            }}
            onChange={(event) => {
              event.preventDefault();
              updateTitle(event.currentTarget);
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={(event) => {
              composing.current = false;
              updateTitle(event.currentTarget);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              cancelEditing();
            }}
            render={
              <Input
                ref={input}
                type="text"
                variant="ghost"
                readOnly={submitting}
                maxLength={CAMPAIGN_TITLE_MAX_UTF16_LENGTH}
                style={styles.input}
              />
            }
          />
        )}
      </h1>
      <FormError name={form.names.title} render={<Field.Error style={styles.error} />} />
    </AriakitForm>
  );
}

const styles = stylex.create({
  form: {
    maxWidth: "36rem",
    minWidth: 0,
    position: "relative",
    width: "100%",
  },
  heading: {
    display: "flex",
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    justifyContent: "center",
    lineHeight: tokens.lineHeightSmall,
    margin: 0,
    minWidth: 0,
  },
  trigger: {
    color: colors.foregroundPrimary,
    fontSize: "inherit",
    fontWeight: "inherit",
    height: tokens.controlHeight,
    justifyContent: "center",
    lineHeight: "inherit",
    maxWidth: "100%",
    minWidth: 0,
    paddingInline: "0.5rem",
  },
  title: {
    minWidth: 0,
    overflow: "hidden",
    textBox: "normal",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  input: {
    backgroundColor: {
      default: "transparent",
      ":hover": colors.backgroundNeutralSubtlest,
      ":focus": colors.backgroundNeutralSubtlest,
    },
    borderRadius: radii.control,
    boxShadow: {
      default: "none",
      ":focus": `inset 0 0 0 1px ${colors.borderFocus}`,
      ':is([aria-invalid="true"])': `inset 0 0 0 1px ${colors.borderDanger}`,
      ':is([aria-invalid="true"]):focus': `inset 0 0 0 1px ${colors.borderDangerFocus}`,
    },
    display: "block",
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    height: tokens.controlHeight,
    lineHeight: tokens.lineHeightSmall,
    minWidth: 0,
    paddingInline: "0.5rem",
    textAlign: "center",
    textOverflow: {
      default: "ellipsis",
      ":focus": "clip",
    },
    width: "100%",
  },
  error: {
    backgroundColor: colors.backgroundSurfaceOverlay,
    borderColor: colors.borderSubtle,
    borderRadius: radii.control,
    borderStyle: "solid",
    borderWidth: 1,
    insetBlockStart: "calc(100% + 0.5rem)",
    insetInline: 0,
    padding: "0.5rem 0.75rem",
    position: "absolute",
  },
});
