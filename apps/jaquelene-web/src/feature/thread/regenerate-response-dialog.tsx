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
import {
  REGENERATION_INSTRUCTIONS_MAX_LENGTH,
  parseRegenerationInstructions,
  regenerationInstructionsSchema,
} from "@jaquelene/domain";
import type { ModelConfigurationSelection } from "@jaquelene/ipc/renderer";
import { Button, Field, Textarea } from "@jaquelene/ui";
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
    if (!regenerationInstructionsSchema.safeParse(state.values.instructions).success) {
      form.setError(
        form.names.instructions,
        `Use ${REGENERATION_INSTRUCTIONS_MAX_LENGTH.toLocaleString("en-US")} characters or fewer.`,
      );
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
        hideOnInteractOutside={false}
      >
        <AriakitForm
          store={form}
          resetOnSubmit={false}
          validateOnBlur={hasSubmitted}
          validateOnChange={hasSubmitted}
        >
          <Dialog.Heading {...stylex.props(styles.heading)}>Regenerate response</Dialog.Heading>
          <Dialog.Description {...stylex.props(styles.description)}>
            Try another response if this one isn’t what you wanted.
          </Dialog.Description>

          <Field.Root style={styles.field}>
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
            <FormError name="configuration" render={<Field.Error />} />
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
                  placeholder="Make it shorter, make it cinematic, surprise me, etc."
                  style={styles.input}
                />
              }
            />
            <FormError name={form.names.instructions} render={<Field.Error />} />
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
  heading: {
    fontSize: tokens.fontSizeLarge,
    fontWeight: 600,
    lineHeight: tokens.lineHeightLarge,
    textBox: "trim-both text",
  },
  description: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.75rem",
  },
  field: { marginTop: "1.25rem" },
  label: {
    color: colors.foregroundSecondary,
    fontWeight: 400,
    textBox: "trim-both text",
  },
  model: { width: "100%", minWidth: 0 },
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
