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
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon";
import {
  PROMPT_BODY_MAX_UTF16_LENGTH,
  PROMPT_TITLE_MAX_UTF16_LENGTH,
  updatePromptInputSchema,
  type UpdatePromptInput,
} from "@jaquelene/domain";
import type { CustomPrompt } from "@jaquelene/ipc/renderer";
import { Button, Field, Form as FormLayout, Input } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { AiActionMenu, AiActionStatus } from "@/feature/ai-action/menu";
import { useAiAction } from "@/feature/ai-action/use-ai-action";
import { useFormStatus } from "@/feature/form/status";
import { MarkdownEditor } from "@/feature/markdown/editor/markdown-editor";
import { IconAction } from "@/primitive/icon-action";
import {
  appendTextVersion,
  emptyTextVersions,
  nextTextVersion,
  previousTextVersion,
  type TextVersionChange,
} from "@/primitive/text-versions";
import { usePromptFormValidation } from "./form";
import { useCreatePrompt, useUpdatePrompt } from "./query";

type PromptEditorProps = {
  aiActionTarget?: string;
  "aria-labelledby": string;
} & (
  | {
      kind: string;
      onSaved: (prompt: CustomPrompt) => void | Promise<void>;
      prompt?: undefined;
    }
  | {
      kind?: undefined;
      onSaved?: (prompt: CustomPrompt) => void | Promise<void>;
      prompt: CustomPrompt;
    }
);

function getEditorValues(prompt?: CustomPrompt): UpdatePromptInput {
  return { body: prompt?.body ?? "", title: prompt?.title ?? "" };
}

function promptValuesEqual(left: UpdatePromptInput, right: UpdatePromptInput) {
  return left.body === right.body && left.title === right.title;
}

export function PromptEditor(props: PromptEditorProps) {
  const { "aria-labelledby": ariaLabelledBy, onSaved, prompt } = props;
  const createPrompt = useCreatePrompt();
  const updatePrompt = useUpdatePrompt();
  const [baseline, setBaseline] = useState(() => getEditorValues(prompt));
  const form = useFormStore({ defaultValues: baseline });
  const body = useFormValue<string>(form, form.names.body);
  const title = useFormValue<string>(form, form.names.title);
  const [versions, setVersions] = useState(emptyTextVersions);
  const [historyKey, setHistoryKey] = useState(0);
  const bodyInputRef = useRef<HTMLElement>(null);
  const hasSubmitted = useStoreState(
    form,
    ["submitFailed", "submitSucceed"],
    (state) => state.submitFailed > 0 || state.submitSucceed > 0,
  );
  const [savedPrompt, setSavedPrompt] = useState<CustomPrompt | null>(null);
  const [saving, setSaving] = useState(false);
  const { clear: clearStatus, showError, showSuccess, status } = useFormStatus();
  const operationStatusId = useId();
  const active = useRef(true);
  const savingRef = useRef(false);
  const editing = Boolean(prompt);
  const awaitingCreatedPrompt = !editing && Boolean(savedPrompt);
  const editorReadOnly = saving || awaitingCreatedPrompt;
  const dirty = !promptValuesEqual({ body, title }, baseline);
  const versionNumber = versions.previous.length + 1;
  const versionCount = versionNumber + versions.next.length;
  let submitLabel = "Create";
  if (awaitingCreatedPrompt) {
    submitLabel = "Open prompt";
  } else if (editing) {
    submitLabel = "Save";
  }
  const setBody = useCallback(
    (value: string) => {
      clearStatus();
      form.setValue(form.names.body, value);
    },
    [clearStatus, form],
  );
  const applyVersion = useCallback(
    (change: TextVersionChange) => {
      setVersions(change.versions);
      setHistoryKey((key) => key + 1);
      setBody(change.text);
    },
    [setBody],
  );
  const addVersion = useCallback(
    (text: string) => {
      const change = appendTextVersion(versions, form.getState().values.body, text);
      if (change.versions !== versions) {
        applyVersion(change);
      }
    },
    [applyVersion, form, versions],
  );
  const aiAction = useAiAction({
    target: props.aiActionTarget,
    value: body,
    onValueChange: addVersion,
    disabled: saving || awaitingCreatedPrompt,
  });

  function resetVersions() {
    setVersions(emptyTextVersions());
    setHistoryKey((key) => key + 1);
    aiAction.clear();
  }

  function cancelChanges() {
    if (savingRef.current || awaitingCreatedPrompt || aiAction.busy) {
      return;
    }
    form.reset();
    form.setValues(baseline);
    resetVersions();
    clearStatus();
    bodyInputRef.current?.focus();
  }

  function moveVersion(direction: "previous" | "next") {
    if (savingRef.current || awaitingCreatedPrompt || aiAction.busy) {
      return;
    }
    const current = form.getState().values.body;
    let change: TextVersionChange;
    if (direction === "next") {
      change = nextTextVersion(versions, current);
    } else {
      change = previousTextVersion(versions, current);
    }
    if (change.versions !== versions) {
      applyVersion(change);
      aiAction.clear();
    }
  }

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  usePromptFormValidation(form);
  useFormSubmit(form, async (state) => {
    if (savingRef.current || aiAction.busy) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    clearStatus();

    try {
      let result = savedPrompt;
      if (!result) {
        try {
          const input = updatePromptInputSchema.parse(state.values);
          if (props.prompt) {
            result = await updatePrompt.mutateAsync({ key: props.prompt.key, input });
          } else {
            result = await createPrompt.mutateAsync({ kind: props.kind, ...input });
          }

          if (!active.current) {
            return;
          }

          if (!editing) {
            setSavedPrompt(result);
          }
          const savedValues = getEditorValues(result);
          setBaseline(savedValues);
          form.setValues(savedValues);
          resetVersions();
        } catch (cause) {
          let operation = "prompt.create";
          let message = "Couldn't create this prompt.";
          if (editing) {
            operation = "prompt.update";
            message = "Couldn't save this prompt.";
          }
          reportError(operation, cause);
          if (active.current) {
            showError(message);
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
          showSuccess("Saved");
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

  let statusRole: "alert" | "status" | undefined;
  let describedBy: string | undefined;
  if (status) {
    describedBy = operationStatusId;
    statusRole = "status";
    if (status.tone === "danger") {
      statusRole = "alert";
    }
  }

  return (
    <AriakitForm
      store={form}
      aria-busy={saving || undefined}
      aria-describedby={describedBy}
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
              ref={bodyInputRef}
              value={body}
              historyKey={historyKey}
              onValueChange={setBody}
              maxLength={PROMPT_BODY_MAX_UTF16_LENGTH}
              readOnly={editorReadOnly || aiAction.busy}
              toolbarActions={<AiActionMenu control={aiAction} />}
              statusContent={
                <>
                  <AiActionStatus control={aiAction} />
                  {versionCount > 1 && (
                    <div role="group" aria-label="Text versions" {...stylex.props(styles.versions)}>
                      <IconAction
                        icon={ArrowLeft01Icon}
                        label="Previous version"
                        disabled={editorReadOnly || aiAction.busy || versions.previous.length === 0}
                        onClick={() => moveVersion("previous")}
                      />
                      <span
                        role="status"
                        aria-label={`Version ${versionNumber} of ${versionCount}`}
                        {...stylex.props(styles.versionNumber)}
                      >
                        {versionNumber} / {versionCount}
                      </span>
                      <IconAction
                        icon={ArrowRight01Icon}
                        label="Next version"
                        disabled={editorReadOnly || aiAction.busy || versions.next.length === 0}
                        onClick={() => moveVersion("next")}
                      />
                    </div>
                  )}
                </>
              }
            />
          }
        />
        <FormError name={form.names.body} render={<Field.Error style={styles.promptError} />} />
      </Field.Root>

      <div {...stylex.props(styles.actions)}>
        <FormLayout.Status
          id={operationStatusId}
          role={statusRole}
          tone={status?.tone ?? "neutral"}
        >
          {status?.message}
        </FormLayout.Status>

        {dirty && (
          <Button
            type="button"
            variant="ghost"
            disabled={editorReadOnly || aiAction.busy}
            onClick={cancelChanges}
          >
            Cancel
          </Button>
        )}

        <Button type="submit" disabled={saving || aiAction.busy} aria-busy={saving || undefined}>
          {submitLabel}
        </Button>
      </div>
    </AriakitForm>
  );
}

const styles = stylex.create({
  versions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "0.125rem",
    marginInlineEnd: "0.75rem",
  },
  versionNumber: {
    fontVariantNumeric: "tabular-nums",
    minWidth: "5ch",
    textAlign: "center",
  },
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
