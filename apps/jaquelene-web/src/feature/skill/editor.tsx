import {
  Form as AriakitForm,
  FormDescription,
  FormControl,
  FormError,
  FormInput,
  FormLabel,
  useFormStore,
  useFormSubmit,
  useFormValue,
} from "@ariakit/react/form";
import { useStoreState } from "@ariakit/react/store";
import {
  PROMPT_MAX_UTF16_LENGTH,
  SKILL_TITLE_MAX_UTF16_LENGTH,
  updateSkillInputSchema,
  type UpdateSkillInput,
} from "@jaquelene/domain";
import type { CustomSkill } from "@jaquelene/ipc/renderer";
import { Button, Field, Form as FormLayout, Input } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { useFormStatus } from "@/feature/form/status";
import { MarkdownEditor } from "@/feature/markdown/editor/markdown-editor";
import { useSkillFormValidation } from "./form";
import { useCreateSkill, useUpdateSkill } from "./query";

type SkillEditorProps = {
  "aria-labelledby": string;
  onCancel?: () => void | Promise<void>;
} & (
  | {
      kind: string;
      onSaved: (skill: CustomSkill) => void | Promise<void>;
      skill?: undefined;
    }
  | {
      kind?: undefined;
      onSaved?: (skill: CustomSkill) => void | Promise<void>;
      skill: CustomSkill;
    }
);

function getEditorValues(skill?: CustomSkill): UpdateSkillInput {
  return { prompt: skill?.prompt ?? "", title: skill?.title ?? "" };
}

function skillValuesEqual(left: UpdateSkillInput, right: UpdateSkillInput) {
  return left.prompt === right.prompt && left.title === right.title;
}

export function SkillEditor(props: SkillEditorProps) {
  const { "aria-labelledby": ariaLabelledBy, onCancel, onSaved, skill } = props;
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const form = useFormStore({ defaultValues: getEditorValues(skill) });
  const prompt = useFormValue<string>(form, form.names.prompt);
  const hasSubmitted = useStoreState(
    form,
    ["submitFailed", "submitSucceed"],
    (state) => state.submitFailed > 0 || state.submitSucceed > 0,
  );
  const [savedSkill, setSavedSkill] = useState<CustomSkill | null>(null);
  const [saving, setSaving] = useState(false);
  const { clear: clearStatus, showError, showSuccess, status } = useFormStatus();
  const operationStatusId = useId();
  const active = useRef(true);
  const savingRef = useRef(false);
  const editing = Boolean(skill);
  const awaitingCreatedSkill = !editing && Boolean(savedSkill);
  const editorReadOnly = !editing && (saving || awaitingCreatedSkill);
  const submitLabel = awaitingCreatedSkill ? "Open prompt" : editing ? "Save" : "Create";
  const setPrompt = useCallback(
    (value: string) => {
      clearStatus();
      form.setValue(form.names.prompt, value);
    },
    [clearStatus, form],
  );

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useSkillFormValidation(form);
  useFormSubmit(form, async (state) => {
    if (savingRef.current) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    clearStatus();

    try {
      let result = savedSkill;
      let submittedValues: UpdateSkillInput | null = null;

      if (!result) {
        try {
          const input = updateSkillInputSchema.parse(state.values);
          submittedValues = input;
          result = props.skill
            ? await updateSkill.mutateAsync({ key: props.skill.key, input })
            : await createSkill.mutateAsync({ kind: props.kind, ...input });

          if (!active.current) {
            return;
          }

          if (!editing) {
            setSavedSkill(result);
          }
        } catch (cause) {
          reportError(editing ? "skill.update" : "skill.create", cause);
          if (active.current) {
            showError(editing ? "Couldn't save this prompt." : "Couldn't create this prompt.");
          }
          return;
        }
      }

      if (!active.current) {
        return;
      }

      try {
        await onSaved?.(result);
        if (active.current) {
          setSavedSkill(null);
          if (!submittedValues || skillValuesEqual(form.getState().values, submittedValues)) {
            showSuccess("Saved");
          }
        }
      } catch (cause) {
        reportError("skill.after-save", cause);
        if (active.current) {
          showError("The prompt was saved, but its page couldn't be updated.");
        }
      }
    } finally {
      savingRef.current = false;
      if (active.current) {
        setSaving(false);
      }
    }
  });

  return (
    <AriakitForm
      store={form}
      aria-busy={saving || undefined}
      aria-describedby={status ? operationStatusId : undefined}
      aria-labelledby={ariaLabelledBy}
      onSubmit={clearStatus}
      render={<FormLayout.Root />}
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
              maxLength={SKILL_TITLE_MAX_UTF16_LENGTH}
              onChange={clearStatus}
              readOnly={editorReadOnly}
              style={styles.titleInput}
            />
          }
        />
        <FormError name={form.names.title} render={<Field.Error />} />
      </Field.Root>

      <Field.Root style={styles.promptField}>
        <FormLabel name={form.names.prompt} render={<Field.Label />}>
          Prompt
        </FormLabel>
        <FormDescription
          name={form.names.prompt}
          render={<Field.Description style={styles.promptDescription} />}
        >
          AI models receive this text. Keep it concise.
        </FormDescription>
        <FormControl
          name={form.names.prompt}
          render={
            <MarkdownEditor
              value={prompt}
              onValueChange={setPrompt}
              maxLength={PROMPT_MAX_UTF16_LENGTH}
              readOnly={editorReadOnly}
            />
          }
        />
        <FormError name={form.names.prompt} render={<Field.Error style={styles.promptError} />} />
      </Field.Root>

      <div {...stylex.props(styles.actions)}>
        <FormLayout.Status
          id={operationStatusId}
          role={status?.tone === "danger" ? "alert" : status ? "status" : undefined}
          tone={status?.tone ?? "neutral"}
        >
          {status?.message}
        </FormLayout.Status>

        {onCancel ? (
          <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}

        <Button type="submit" aria-busy={saving || undefined}>
          {submitLabel}
        </Button>
      </div>
    </AriakitForm>
  );
}

const styles = stylex.create({
  titleInput: { width: "100%" },
  promptField: {
    gap: 0,
    marginBlockStart: "0.5rem",
  },
  promptDescription: {
    marginBlockEnd: "0.75rem",
    marginBlockStart: "0.25rem",
  },
  promptError: {
    marginBlockStart: "0.5rem",
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
    justifyContent: "flex-end",
  },
});
