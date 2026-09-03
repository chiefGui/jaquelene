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
import { MarkdownEditor } from "@/feature/markdown/editor/markdown-editor";
import { usePromptFormValidation } from "./form";
import { useCreatePrompt, useUpdatePrompt } from "./query";

type PromptEditorProps = {
  "aria-labelledby": string;
  onSaved: (prompt: Prompt) => Promise<void>;
} & ({ kind: string; prompt?: undefined } | { kind?: undefined; prompt: Prompt });

function getEditorValues(prompt?: Prompt): UpdatePromptInput {
  return { body: prompt?.body ?? "", title: prompt?.title ?? "" };
}

export function PromptEditor(props: PromptEditorProps) {
  const { "aria-labelledby": ariaLabelledBy, onSaved, prompt } = props;
  const createPrompt = useCreatePrompt();
  const updatePrompt = useUpdatePrompt();
  const form = useFormStore({ defaultValues: getEditorValues(prompt) });
  const body = useFormValue<string>(form, form.names.body);
  const setBody = useCallback((value: string) => form.setValue(form.names.body, value), [form]);
  const submitting = useStoreState(form, "submitting");
  const hasSubmitted = useStoreState(
    form,
    ["submitFailed", "submitSucceed"],
    (state) => state.submitFailed > 0 || state.submitSucceed > 0,
  );
  const [savedPrompt, setSavedPrompt] = useState<Prompt | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const operationErrorId = useId();
  const active = useRef(true);
  const editing = Boolean(prompt);
  const saved = Boolean(savedPrompt);
  const disabled = submitting || saved;
  const submitLabel = submitting
    ? saved
      ? "Opening…"
      : "Saving…"
    : saved
      ? "Open prompts"
      : editing
        ? "Save"
        : "Create";

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  usePromptFormValidation(form);
  useFormSubmit(form, async (state) => {
    setOperationError(null);
    let result = savedPrompt;

    if (!result) {
      try {
        const input = updatePromptInputSchema.parse(state.values);
        result = props.prompt
          ? await updatePrompt.mutateAsync({ key: props.prompt.key, input })
          : await createPrompt.mutateAsync({ kind: props.kind, ...input });

        if (!active.current) {
          return;
        }

        setSavedPrompt(result);
      } catch (cause) {
        reportError(editing ? "prompt.update" : "prompt.create", cause);
        if (active.current) {
          setOperationError(
            editing ? "Couldn’t save this prompt." : "Couldn’t create this prompt.",
          );
        }
        return;
      }
    }

    if (!active.current) {
      return;
    }

    try {
      await onSaved(result);
    } catch (cause) {
      reportError("prompt.open-list", cause);
      if (active.current) {
        setOperationError("The prompt was saved, but the prompt list couldn’t be opened.");
      }
    }
  });

  return (
    <AriakitForm
      store={form}
      aria-busy={submitting || undefined}
      aria-describedby={operationError ? operationErrorId : undefined}
      aria-labelledby={ariaLabelledBy}
      onSubmit={() => setOperationError(null)}
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
              autoFocus
              maxLength={PROMPT_TITLE_MAX_UTF16_LENGTH}
              disabled={disabled}
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
          This text is applied according to the prompt’s kind.
        </FormDescription>
        <FormControl
          name={form.names.body}
          render={
            <MarkdownEditor
              value={body}
              onValueChange={setBody}
              maxLength={PROMPT_BODY_MAX_UTF16_LENGTH}
              disabled={disabled}
            />
          }
        />
        <FormError name={form.names.body} render={<Field.Error style={styles.promptError} />} />
      </Field.Root>

      <FormLayout.Status
        id={operationErrorId}
        role={operationError ? "alert" : undefined}
        tone={operationError ? "danger" : "neutral"}
      >
        {operationError}
      </FormLayout.Status>

      <Button type="submit" disabled={submitting} style={styles.submit}>
        {submitLabel}
      </Button>
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
  submit: { alignSelf: "flex-end" },
});
