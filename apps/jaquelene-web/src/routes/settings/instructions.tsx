import {
  ROLEPLAY_INSTRUCTION_BODY_MAX_LENGTH,
  ROLEPLAY_INSTRUCTION_BODY_MAX_UTF16_LENGTH,
  ROLEPLAY_INSTRUCTION_TITLE_MAX_LENGTH,
  ROLEPLAY_INSTRUCTION_TITLE_MAX_UTF16_LENGTH,
  roleplayInstructionInputSchema,
} from "@jaquelene/domain";
import { InstructionOrigin, type Instruction } from "@jaquelene/ipc/renderer";
import { Badge, Button, Field, Form, Input, Item, formatCount } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { Dialog } from "@jaquelene/ui/dialog";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useId, useState, type ReactElement, type SubmitEvent } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import type { FormValidationIssue } from "@/feature/form/zod";
import {
  instructionGroupsQuery,
  useCreateRoleplayInstruction,
  useDeleteRoleplayInstruction,
  useUpdateRoleplayInstruction,
} from "@/feature/instruction/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/settings/instructions")({
  loader: ({ context }) => context.queryClient.query(instructionGroupsQuery),
  component: InstructionsRoute,
});

type EditorErrors = Partial<Record<"body" | "title", string>>;

function formatEditorErrors(issues: readonly FormValidationIssue[]): EditorErrors {
  const errors: EditorErrors = {};

  for (const issue of issues) {
    const field = issue.path.at(-1);

    if ((field !== "title" && field !== "body") || errors[field]) {
      continue;
    }

    errors[field] =
      issue.code === "too_big"
        ? field === "title"
          ? `Use ${formatCount(ROLEPLAY_INSTRUCTION_TITLE_MAX_LENGTH)} characters or fewer.`
          : `Use ${formatCount(ROLEPLAY_INSTRUCTION_BODY_MAX_LENGTH)} characters or fewer.`
        : field === "title"
          ? "Enter a title."
          : "Enter instruction text.";
  }

  return errors;
}

function InstructionEditor({
  instruction,
  trigger,
}: {
  instruction?: Instruction;
  trigger: ReactElement;
}) {
  const createInstruction = useCreateRoleplayInstruction();
  const updateInstruction = useUpdateRoleplayInstruction();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(instruction?.title ?? "");
  const [body, setBody] = useState(instruction?.body ?? "");
  const [errors, setErrors] = useState<EditorErrors>({});
  const [operationError, setOperationError] = useState<string | null>(null);
  const titleId = useId();
  const titleErrorId = useId();
  const bodyId = useId();
  const bodyErrorId = useId();
  const operationErrorId = useId();
  const pending = createInstruction.isPending || updateInstruction.isPending;
  const editing = Boolean(instruction);

  function setEditorOpen(nextOpen: boolean) {
    if (pending) {
      return;
    }

    if (nextOpen) {
      createInstruction.reset();
      updateInstruction.reset();
      setTitle(instruction?.title ?? "");
      setBody(instruction?.body ?? "");
      setErrors({});
      setOperationError(null);
    }

    setOpen(nextOpen);
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = roleplayInstructionInputSchema.safeParse({ title, body });

    if (!result.success) {
      setErrors(formatEditorErrors(result.error.issues));
      return;
    }

    setErrors({});
    setOperationError(null);

    try {
      if (instruction) {
        await updateInstruction.mutateAsync({ key: instruction.key, input: result.data });
      } else {
        await createInstruction.mutateAsync(result.data);
      }
      setOpen(false);
    } catch (cause) {
      reportError(editing ? "roleplay-instruction.update" : "roleplay-instruction.create", cause);
      setOperationError(
        editing ? "Couldn’t save this instruction." : "Couldn’t create this instruction.",
      );
    }
  }

  return (
    <Dialog.Root open={open} setOpen={setEditorOpen}>
      <Dialog.Trigger render={trigger} />
      <Dialog.Content
        aria-busy={pending || undefined}
        aria-describedby={operationError ? operationErrorId : undefined}
        hideOnEscape={!pending}
        hideOnInteractOutside={!pending}
        style={styles.dialog}
      >
        <Dialog.Heading {...stylex.props(styles.dialogHeading)}>
          {editing ? "Edit roleplay instruction" : "Create roleplay instruction"}
        </Dialog.Heading>

        <form onSubmit={save} {...stylex.props(styles.editor)}>
          <Field.Root>
            <Field.Label htmlFor={titleId}>Title</Field.Label>
            <Input
              id={titleId}
              type="text"
              autoFocus
              value={title}
              maxLength={ROLEPLAY_INSTRUCTION_TITLE_MAX_UTF16_LENGTH}
              disabled={pending}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? titleErrorId : undefined}
              onChange={(event) => setTitle(event.currentTarget.value)}
              style={styles.titleInput}
            />
            <Field.Error id={titleErrorId}>{errors.title}</Field.Error>
          </Field.Root>

          <Field.Root>
            <Field.Label htmlFor={bodyId}>Instructions</Field.Label>
            <Field.Description>Only this text is sent to the model.</Field.Description>
            <textarea
              id={bodyId}
              value={body}
              maxLength={ROLEPLAY_INSTRUCTION_BODY_MAX_UTF16_LENGTH}
              disabled={pending}
              aria-invalid={Boolean(errors.body)}
              aria-describedby={errors.body ? bodyErrorId : undefined}
              onChange={(event) => setBody(event.currentTarget.value)}
              {...stylex.props(styles.bodyInput)}
            />
            <Field.Error id={bodyErrorId}>{errors.body}</Field.Error>
          </Field.Root>

          <Form.Status
            id={operationErrorId}
            role={operationError ? "alert" : undefined}
            tone={operationError ? "danger" : "neutral"}
          >
            {operationError}
          </Form.Status>

          <div {...stylex.props(styles.dialogActions)}>
            <Dialog.Dismiss disabled={pending} render={<Button type="button" variant="ghost" />}>
              Cancel
            </Dialog.Dismiss>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function DeleteInstruction({ instruction }: { instruction: Instruction }) {
  const deleteInstruction = useDeleteRoleplayInstruction();
  const [open, setOpen] = useState(false);

  function setConfirmationOpen(nextOpen: boolean) {
    if (nextOpen) {
      deleteInstruction.reset();
    }
    setOpen(nextOpen);
  }

  async function remove() {
    try {
      await deleteInstruction.mutateAsync(instruction.key);
      setOpen(false);
    } catch (cause) {
      reportError("roleplay-instruction.delete", cause);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      setOpen={setConfirmationOpen}
      trigger={
        <Button type="button" variant="ghost" tone="danger" disabled={deleteInstruction.isPending}>
          Delete
        </Button>
      }
      heading={`Delete “${instruction.title}”?`}
      description="Campaigns using it will return to the built-in Default instruction. This can’t be undone."
      confirmLabel="Delete"
      pending={deleteInstruction.isPending}
      error={deleteInstruction.isError ? "Couldn’t delete this instruction." : undefined}
      onConfirm={() => void remove()}
    />
  );
}

function InstructionItem({ instruction }: { instruction: Instruction }) {
  if (
    instruction.origin !== InstructionOrigin.Custom &&
    instruction.origin !== InstructionOrigin.Factory
  ) {
    throw new Error(`Unknown instruction origin "${instruction.origin}".`);
  }

  const custom = instruction.origin === InstructionOrigin.Custom;

  return (
    <Item.Root style={styles.instruction}>
      <div {...stylex.props(styles.instructionHeader)}>
        <div {...stylex.props(styles.instructionIdentity)}>
          <Item.Label>{instruction.title}</Item.Label>
          <Badge>{custom ? "Custom" : "Built-in"}</Badge>
        </div>

        {custom ? (
          <div {...stylex.props(styles.instructionActions)}>
            <InstructionEditor
              instruction={instruction}
              trigger={
                <Button type="button" variant="ghost">
                  Edit
                </Button>
              }
            />
            <DeleteInstruction instruction={instruction} />
          </div>
        ) : null}
      </div>

      <p {...stylex.props(styles.instructionBody)}>{instruction.body}</p>
    </Item.Root>
  );
}

function InstructionsRoute() {
  const { data: groups } = useSuspenseQuery(instructionGroupsQuery);

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>Settings</Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Page>Instructions</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          {groups.map((group) => {
            const headingId = `instruction-group-${group.key}`;
            const descriptionId = `instruction-group-description-${group.key}`;

            return (
              <Item.Section
                key={group.key}
                aria-labelledby={headingId}
                aria-describedby={descriptionId}
              >
                <Item.SectionHeader style={styles.sectionHeader}>
                  <div {...stylex.props(styles.sectionIdentity)}>
                    <Item.Heading id={headingId}>{group.name}</Item.Heading>
                    <Item.SectionDescription id={descriptionId}>
                      {group.description}
                    </Item.SectionDescription>
                  </div>

                  {group.key === "roleplay" ? (
                    <InstructionEditor
                      trigger={
                        <Button type="button" variant="soft">
                          Create
                        </Button>
                      }
                    />
                  ) : null}
                </Item.SectionHeader>

                <Item.Group>
                  {group.instructions.map((instruction) => (
                    <InstructionItem key={instruction.key} instruction={instruction} />
                  ))}
                </Item.Group>
              </Item.Section>
            );
          })}
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  sectionHeader: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionIdentity: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    minWidth: 0,
  },
  instruction: {
    display: "block",
  },
  instructionHeader: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  instructionIdentity: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    minWidth: 0,
  },
  instructionActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "0.25rem",
  },
  instructionBody: {
    color: colors.foregroundPrimary,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginBlock: "1rem 0",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  dialog: {
    width: "40rem",
  },
  dialogHeading: {
    fontSize: tokens.fontSizeLarge,
    fontWeight: 600,
    lineHeight: tokens.lineHeightLarge,
  },
  editor: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
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
