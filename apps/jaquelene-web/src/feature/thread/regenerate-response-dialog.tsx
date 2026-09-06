import {
  Form as AriakitForm,
  FormControl,
  FormError,
  FormInput,
  FormLabel,
  useFormStore,
  useFormSubmit,
  useFormValidate,
  useFormValue,
} from "@ariakit/react/form";
import { useStoreState } from "@ariakit/react/store";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  REGENERATION_INSTRUCTIONS_MAX_LENGTH,
  parseRegenerationInstructions,
} from "@jaquelene/domain";
import type { ModelConfigurationSelection } from "@jaquelene/ipc/renderer";
import { Button, Field, IconButton, Textarea } from "@jaquelene/ui";
import { Dialog } from "@jaquelene/ui/dialog";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useRef, type ReactElement } from "react";
import { ModelPicker } from "@/feature/model/picker";

export function RegenerateResponseDialog({
  open,
  setOpen,
  trigger,
  pending,
  disabled,
  requestFailed,
  initialConfiguration,
  onRegenerate,
}: Readonly<{
  open: boolean;
  setOpen: (open: boolean) => void;
  trigger: ReactElement;
  pending: boolean;
  disabled: boolean;
  requestFailed: boolean;
  initialConfiguration: ModelConfigurationSelection | null;
  onRegenerate: (
    configuration: ModelConfigurationSelection,
    instructions?: string,
  ) => Promise<void>;
}>) {
  const form = useFormStore({
    defaultValues: { configuration: initialConfiguration, instructions: "" },
  });
  const configuration = useFormValue<ModelConfigurationSelection | null>(form, "configuration");
  const submitting = useStoreState(form, "submitting");
  const hasSubmitted = useStoreState(
    form,
    ["submitFailed", "submitSucceed"],
    (state) => state.submitFailed > 0 || state.submitSucceed > 0,
  );
  const busy = pending || submitting;
  const input = useRef<HTMLTextAreaElement>(null);

  useFormValidate(form, (state) => {
    form.setErrors({});
    if (state.values.configuration === null) {
      form.setError("configuration", "Choose a model.");
    }
  });
  useFormSubmit(form, async (state) => {
    if (disabled || state.values.configuration === null) {
      return;
    }
    await onRegenerate(
      state.values.configuration,
      parseRegenerationInstructions(state.values.instructions),
    );
  });

  function changeOpen(nextOpen: boolean) {
    if (busy) {
      return;
    }

    if (nextOpen) {
      form.reset();
      form.setValues({ configuration: initialConfiguration, instructions: "" });
    }

    setOpen(nextOpen);
  }

  return (
    <Dialog.Root open={open} setOpen={changeOpen}>
      <Dialog.Trigger render={trigger} />
      <Dialog.Content
        style={styles.dialog}
        initialFocus={input}
        aria-busy={busy || undefined}
        hideOnEscape={!busy}
        hideOnInteractOutside={!busy}
      >
        <AriakitForm
          store={form}
          resetOnSubmit={false}
          validateOnBlur={hasSubmitted}
          validateOnChange={hasSubmitted}
        >
          <div {...stylex.props(styles.header)}>
            <Dialog.Heading>Regenerate response</Dialog.Heading>
            <Dialog.Dismiss
              disabled={busy}
              render={
                <IconButton.Root type="button" size="small" aria-label="Close regeneration dialog">
                  <IconButton.Icon render={<HugeiconsIcon icon={Cancel01Icon} />} />
                </IconButton.Root>
              }
            />
          </div>

          <Field.Root style={[styles.field, styles.modelField]}>
            <FormLabel name="configuration" render={<Field.Label style={styles.label} />}>
              Model
            </FormLabel>
            <ModelPicker.Root
              value={configuration?.model ?? null}
              onValueChange={(model) => {
                if (disabled || busy) {
                  return;
                }
                if (
                  configuration?.model.providerId === model.providerId &&
                  configuration.model.modelId === model.modelId
                ) {
                  return;
                }
                // Reasoning settings belong to the selected model. A different
                // model starts with its defaults for this request.
                form.setValue("configuration", { model });
              }}
            >
              <FormControl
                name="configuration"
                render={
                  <ModelPicker.Trigger
                    type="button"
                    disabled={disabled || busy}
                    style={styles.model}
                  />
                }
              />
              <ModelPicker.Content style={styles.modelPopover} />
            </ModelPicker.Root>
            <FormError name="configuration" render={<Field.Error style={styles.modelError} />} />
          </Field.Root>

          <Field.Root style={styles.field}>
            <FormLabel name={form.names.instructions} render={<Field.Label style={styles.label} />}>
              Instructions (optional)
            </FormLabel>
            <FormInput
              name={form.names.instructions}
              render={
                <Textarea
                  ref={input}
                  readOnly={busy}
                  maxLength={REGENERATION_INSTRUCTIONS_MAX_LENGTH}
                  placeholder="Make it shorter, make it cinematic, surprise me, etc."
                  style={styles.input}
                />
              }
            />
          </Field.Root>

          <p role="alert" {...stylex.props(styles.status)}>
            {requestFailed && "Couldn't start regeneration. Try again."}
          </p>
          <div {...stylex.props(styles.actions)}>
            <Dialog.Dismiss disabled={busy} render={<Button type="button" variant="ghost" />}>
              Cancel
            </Dialog.Dismiss>
            <Button type="submit" disabled={disabled || busy}>
              Regenerate
            </Button>
          </div>
        </AriakitForm>
      </Dialog.Content>
    </Dialog.Root>
  );
}

const styles = stylex.create({
  dialog: { width: "32rem" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
  },
  field: { marginTop: "1.25rem" },
  label: {
    color: colors.foregroundSecondary,
    fontWeight: 400,
    textBox: "trim-both text",
  },
  modelField: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    alignItems: "center",
    columnGap: "1.5rem",
  },
  model: { justifySelf: "end", maxWidth: "100%", minWidth: 0 },
  modelError: { gridColumn: "2", textAlign: "end" },
  modelPopover: { zIndex: 101 },
  input: { resize: "none" },
  status: {
    color: colors.foregroundDanger,
    display: { default: "block", ":empty": "none" },
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.5rem",
  },
  actions: {
    display: "flex",
    gap: "0.25rem",
    justifyContent: "flex-end",
    marginTop: "1.5rem",
  },
});
