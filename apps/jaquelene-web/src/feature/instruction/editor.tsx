import {
  Form as AriakitForm,
  FormDescription,
  FormError,
  FormInput,
  FormLabel,
  useFormStore,
  useFormSubmit,
} from "@ariakit/react/form";
import { useStoreState } from "@ariakit/react/store";
import {
  ROLEPLAY_INSTRUCTION_BODY_MAX_UTF16_LENGTH,
  ROLEPLAY_INSTRUCTION_TITLE_MAX_UTF16_LENGTH,
  roleplayInstructionInputSchema,
  type RoleplayInstructionInput,
} from "@jaquelene/domain";
import type { Instruction } from "@jaquelene/ipc/renderer";
import { Button, Field, Form as FormLayout, Input } from "@jaquelene/ui";
import { Dialog } from "@jaquelene/ui/dialog";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useId, useState, type ReactElement } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { useRoleplayInstructionFormValidation } from "./form";
import { useCreateRoleplayInstruction, useUpdateRoleplayInstruction } from "./query";

type RoleplayInstructionEditorProps = {
  instruction?: Instruction;
  trigger: ReactElement;
};

function getEditorValues(instruction?: Instruction): RoleplayInstructionInput {
  return {
    body: instruction?.body ?? "",
    title: instruction?.title ?? "",
  };
}

export function RoleplayInstructionEditor({
  instruction,
  trigger,
}: RoleplayInstructionEditorProps) {
  const createInstruction = useCreateRoleplayInstruction();
  const updateInstruction = useUpdateRoleplayInstruction();
  const form = useFormStore({
    defaultValues: getEditorValues(instruction),
  });
  const submitting = useStoreState(form, "submitting");
  const hasSubmitted = useStoreState(
    form,
    ["submitFailed", "submitSucceed"],
    (state) => state.submitFailed > 0 || state.submitSucceed > 0,
  );
  const [open, setOpen] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const operationErrorId = useId();
  const editing = Boolean(instruction);
  let submitLabel = editing ? "Save" : "Create";

  if (submitting) {
    submitLabel = "Saving…";
  }

  useRoleplayInstructionFormValidation(form);
  useFormSubmit(form, async (state) => {
    setOperationError(null);

    try {
      const input = roleplayInstructionInputSchema.parse(state.values);

      if (instruction) {
        await updateInstruction.mutateAsync({ key: instruction.key, input });
      } else {
        await createInstruction.mutateAsync(input);
      }
      setOpen(false);
    } catch (cause) {
      reportError(editing ? "roleplay-instruction.update" : "roleplay-instruction.create", cause);
      setOperationError(
        editing ? "Couldn’t save this instruction." : "Couldn’t create this instruction.",
      );
    }
  });

  function setEditorOpen(nextOpen: boolean) {
    if (submitting) {
      return;
    }

    if (nextOpen) {
      form.reset();
      form.setValues(getEditorValues(instruction));
      setOperationError(null);
    }

    setOpen(nextOpen);
  }

  return (
    <Dialog.Root open={open} setOpen={setEditorOpen}>
      <Dialog.Trigger render={trigger} />

      <Dialog.Content
        aria-describedby={operationError ? operationErrorId : undefined}
        hideOnEscape={!submitting}
        hideOnInteractOutside={!submitting}
        style={styles.dialog}
      >
        <Dialog.Heading {...stylex.props(styles.dialogHeading)}>
          {editing ? "Edit roleplay instruction" : "Create roleplay instruction"}
        </Dialog.Heading>

        <AriakitForm
          store={form}
          aria-busy={submitting || undefined}
          onSubmit={() => setOperationError(null)}
          render={<FormLayout.Root style={styles.editor} />}
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
                  maxLength={ROLEPLAY_INSTRUCTION_TITLE_MAX_UTF16_LENGTH}
                  disabled={submitting}
                  style={styles.titleInput}
                />
              }
            />
            <FormError name={form.names.title} render={<Field.Error />} />
          </Field.Root>

          <Field.Root>
            <FormLabel name={form.names.body} render={<Field.Label />}>
              Instructions
            </FormLabel>
            <FormDescription name={form.names.body} render={<Field.Description />}>
              Only this text is sent to the model.
            </FormDescription>
            <FormInput
              name={form.names.body}
              render={
                <textarea
                  maxLength={ROLEPLAY_INSTRUCTION_BODY_MAX_UTF16_LENGTH}
                  disabled={submitting}
                  {...stylex.props(styles.bodyInput)}
                />
              }
            />
            <FormError name={form.names.body} render={<Field.Error />} />
          </Field.Root>

          <FormLayout.Status
            id={operationErrorId}
            role={operationError ? "alert" : undefined}
            tone={operationError ? "danger" : "neutral"}
          >
            {operationError}
          </FormLayout.Status>

          <div {...stylex.props(styles.dialogActions)}>
            <Dialog.Dismiss disabled={submitting} render={<Button type="button" variant="ghost" />}>
              Cancel
            </Dialog.Dismiss>
            <Button type="submit" disabled={submitting}>
              {submitLabel}
            </Button>
          </div>
        </AriakitForm>
      </Dialog.Content>
    </Dialog.Root>
  );
}

const styles = stylex.create({
  dialog: {
    width: "40rem",
  },
  dialogHeading: {
    fontSize: tokens.fontSizeLarge,
    fontWeight: 600,
    lineHeight: tokens.lineHeightLarge,
  },
  editor: {
    marginTop: "1rem",
  },
  titleInput: {
    width: "100%",
  },
  bodyInput: {
    backgroundColor: {
      default: colors.backgroundNeutralSubtlest,
      ":focus": colors.backgroundNeutralSubtler,
    },
    borderColor: {
      default: colors.borderDefault,
      ":focus": colors.borderFocus,
      ':is([aria-invalid="true"])': colors.borderDanger,
      ':is([aria-invalid="true"]):focus': colors.borderDangerFocus,
    },
    borderRadius: tokens.radiusMedium,
    borderStyle: "solid",
    borderWidth: 1,
    caretColor: colors.foregroundAccent,
    color: colors.foregroundPrimary,
    fontFamily: "inherit",
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    minHeight: "14rem",
    opacity: {
      default: 1,
      ":disabled": 0.5,
    },
    outline: "none",
    padding: "0.625rem",
    resize: "vertical",
    width: "100%",
  },
  dialogActions: {
    display: "flex",
    gap: "0.5rem",
    justifyContent: "flex-end",
  },
});
