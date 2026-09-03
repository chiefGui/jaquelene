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
  PROMPT_BODY_MAX_UTF16_LENGTH,
  PROMPT_TITLE_MAX_UTF16_LENGTH,
  updatePromptInputSchema,
  type UpdatePromptInput,
} from "@jaquelene/domain";
import type { Prompt } from "@jaquelene/ipc/renderer";
import { Button, Field, Form as FormLayout, Input } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { useFormStatus } from "@/feature/form/status";
import { MarkdownEditor } from "@/feature/markdown/editor/markdown-editor";
import { usePromptFormValidation } from "./form";
import { useCreatePrompt, useUpdatePrompt } from "./query";

type PromptEditorProps = {
  "aria-labelledby": string;
  onCancel?: () => void | Promise<void>;
} & (
  | {
      kind: string;
      onSaved: (prompt: Prompt) => void | Promise<void>;
      prompt?: undefined;
    }
  | {
      kind?: undefined;
      onSaved?: (prompt: Prompt) => void | Promise<void>;
      prompt: Prompt;
    }
);

function getEditorValues(prompt?: Prompt): UpdatePromptInput {
  return { body: prompt?.body ?? "", title: prompt?.title ?? "" };
}

function promptValuesEqual(left: UpdatePromptInput, right: UpdatePromptInput) {
  return left.body === right.body && left.title === right.title;
}

export function PromptEditor(props: PromptEditorProps) {
  const { "aria-labelledby": ariaLabelledBy, onCancel, onSaved, prompt } = props;
  const createPrompt = useCreatePrompt();
  const updatePrompt = useUpdatePrompt();
  const form = useFormStore({ defaultValues: getEditorValues(prompt) });
  const body = useFormValue<string>(form, form.names.body);
  const hasSubmitted = useStoreState(
    form,
    ["submitFailed", "submitSucceed"],
    (state) => state.submitFailed > 0 || state.submitSucceed > 0,
  );
  const [savedPrompt, setSavedPrompt] = useState<Prompt | null>(null);
  const [saving, setSaving] = useState(false);
  const { clear: clearStatus, showError, showSuccess, status } = useFormStatus();
  const operationStatusId = useId();
  const active = useRef(true);
  const savingRef = useRef(false);
  const editing = Boolean(prompt);
  const awaitingCreatedPrompt = !editing && Boolean(savedPrompt);
  const editorReadOnly = !editing && (saving || awaitingCreatedPrompt);
  const submitLabel = awaitingCreatedPrompt ? "Open prompt" : editing ? "Save" : "Create";
  const setBody = useCallback(
    (value: string) => {
      clearStatus();
      form.setValue(form.names.body, value);
    },
    [clearStatus, form],
  );

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  usePromptFormValidation(form);
  useFormSubmit(form, async (state) => {
    if (savingRef.current) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    clearStatus();

    try {
      let result = savedPrompt;
      let submittedValues: UpdatePromptInput | null = null;

      if (!result) {
        try {
          const input = updatePromptInputSchema.parse(state.values);
          submittedValues = input;
          result = props.prompt
            ? await updatePrompt.mutateAsync({ key: props.prompt.key, input })
            : await createPrompt.mutateAsync({ kind: props.kind, ...input });

          if (!active.current) {
            return;
          }

          if (!editing) {
            setSavedPrompt(result);
          }
        } catch (cause) {
          reportError(editing ? "prompt.update" : "prompt.create", cause);
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
          setSavedPrompt(null);
          if (!submittedValues || promptValuesEqual(form.getState().values, submittedValues)) {
            showSuccess("Saved");
          }
        }
      } catch (cause) {
        reportError("prompt.after-save", cause);
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
              maxLength={PROMPT_TITLE_MAX_UTF16_LENGTH}
              onChange={clearStatus}
              readOnly={editorReadOnly}
              style={styles.titleInput}
            />
          }
        />
        <FormError name={form.names.title} render={<Field.Error />} />
      </Field.Root>

      <Field.Root style={styles.promptField}>
        <FormLabel name={form.names.body} render={<Field.Label />}>
          Prompt
        </FormLabel>
        <FormDescription
          name={form.names.body}
          render={<Field.Description style={styles.promptDescription} />}
        >
          AI models receive this text. Keep it concise.
        </FormDescription>
        <FormControl
          name={form.names.body}
          render={
            <MarkdownEditor
              value={body}
              onValueChange={setBody}
              maxLength={PROMPT_BODY_MAX_UTF16_LENGTH}
              readOnly={editorReadOnly}
            />
          }
        />
        <FormError name={form.names.body} render={<Field.Error style={styles.promptError} />} />
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
