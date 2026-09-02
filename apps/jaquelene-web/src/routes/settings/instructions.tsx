import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import TrashIcon from "@hugeicons/core-free-icons/TrashIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { InstructionOrigin, type Instruction } from "@jaquelene/ipc/renderer";
import { Badge, Button, Item } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { RoleplayInstructionEditor } from "@/feature/instruction/editor";
import {
  defaultRoleplayInstructionKeyQuery,
  instructionGroupsQuery,
  useDeleteRoleplayInstruction,
  useSetDefaultRoleplayInstruction,
} from "@/feature/instruction/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/settings/instructions")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query(instructionGroupsQuery),
      context.queryClient.query(defaultRoleplayInstructionKeyQuery),
    ]);
  },
  component: InstructionsRoute,
});

function DeleteInstruction({
  disabled,
  instruction,
  isDefault,
}: {
  disabled: boolean;
  instruction: Instruction;
  isDefault: boolean;
}) {
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
        <Button
          type="button"
          aria-label={`Delete ${instruction.title}`}
          size="small"
          variant="ghost"
          disabled={disabled || deleteInstruction.isPending}
        >
          <HugeiconsIcon icon={TrashIcon} size={14} strokeWidth={1.5} aria-hidden="true" />
          <Button.Label>Delete</Button.Label>
        </Button>
      }
      heading={`Delete “${instruction.title}”?`}
      description={
        isDefault
          ? "Jaquelene will become the default, and campaigns using this instruction will return to it. This can’t be undone."
          : "Campaigns using it will return to their default instruction. This can’t be undone."
      }
      confirmLabel="Delete"
      pending={deleteInstruction.isPending}
      error={deleteInstruction.isError ? "Couldn’t delete this instruction." : undefined}
      onConfirm={() => void remove()}
    />
  );
}

function InstructionFooter({
  defaultError,
  defaultPending,
  instruction,
  isDefault,
  onSetDefault,
}: {
  defaultError: boolean;
  defaultPending: boolean;
  instruction: Instruction;
  isDefault: boolean;
  onSetDefault: () => void;
}) {
  const custom = instruction.origin === InstructionOrigin.Custom;

  return (
    <div {...stylex.props(styles.instructionFooter)}>
      <div {...stylex.props(styles.defaultAction)}>
        {isDefault ? (
          <Badge>Default</Badge>
        ) : (
          <Button
            type="button"
            size="small"
            variant="ghost"
            disabled={defaultPending}
            onClick={onSetDefault}
          >
            Set as default
          </Button>
        )}

        {defaultError ? (
          <span role="alert" {...stylex.props(styles.defaultError)}>
            Couldn’t set default.
          </span>
        ) : null}
      </div>

      {custom ? (
        <DeleteInstruction
          disabled={defaultPending}
          instruction={instruction}
          isDefault={isDefault}
        />
      ) : null}
    </div>
  );
}

function InstructionSummary({ instruction }: { instruction: Instruction }) {
  return (
    <>
      <span {...stylex.props(styles.instructionHeading)}>
        <Item.Label render={<span />} style={styles.instructionTitle}>
          {instruction.title}
        </Item.Label>
        {instruction.origin === InstructionOrigin.Factory ? <Badge>Built-in</Badge> : null}
      </span>

      <span {...stylex.props(styles.instructionBody)}>{instruction.body}</span>
    </>
  );
}

function InstructionItem({
  defaultError,
  defaultInstructionKey,
  defaultPending,
  instruction,
  onSetDefault,
}: {
  defaultError: boolean;
  defaultInstructionKey: string;
  defaultPending: boolean;
  instruction: Instruction;
  onSetDefault: () => void;
}) {
  if (
    instruction.origin !== InstructionOrigin.Custom &&
    instruction.origin !== InstructionOrigin.Factory
  ) {
    throw new Error(`Unknown instruction origin "${instruction.origin}".`);
  }

  const isDefault = instruction.key === defaultInstructionKey;
  let content = (
    <div {...stylex.props(styles.instructionContent)}>
      <InstructionSummary instruction={instruction} />
    </div>
  );

  if (instruction.origin === InstructionOrigin.Custom) {
    content = (
      <RoleplayInstructionEditor
        instruction={instruction}
        trigger={
          <button
            type="button"
            aria-label={`Edit ${instruction.title}`}
            {...stylex.props(styles.instructionEditSurface)}
          >
            <InstructionSummary instruction={instruction} />
          </button>
        }
      />
    );
  }

  return (
    <Item.Root style={styles.instruction}>
      {content}

      <InstructionFooter
        defaultError={defaultError}
        defaultPending={defaultPending}
        instruction={instruction}
        isDefault={isDefault}
        onSetDefault={onSetDefault}
      />
    </Item.Root>
  );
}

function InstructionsRoute() {
  const { data: groups } = useSuspenseQuery(instructionGroupsQuery);
  const { data: defaultInstructionKey } = useSuspenseQuery(defaultRoleplayInstructionKeyQuery);
  const setDefaultInstruction = useSetDefaultRoleplayInstruction();

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
                  <Item.SectionContent>
                    <Item.Heading id={headingId}>{group.name}</Item.Heading>
                    <Item.SectionDescription id={descriptionId}>
                      {group.description}
                    </Item.SectionDescription>
                  </Item.SectionContent>

                  {group.key === "roleplay" ? (
                    <RoleplayInstructionEditor
                      trigger={
                        <Button type="button" variant="ghost">
                          <HugeiconsIcon
                            icon={Add01Icon}
                            size={16}
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                          <Button.Label>Create</Button.Label>
                        </Button>
                      }
                    />
                  ) : null}
                </Item.SectionHeader>

                <Item.Group variant="separated">
                  {group.instructions.map((instruction) => (
                    <InstructionItem
                      key={instruction.key}
                      defaultError={
                        setDefaultInstruction.isError &&
                        setDefaultInstruction.variables === instruction.key
                      }
                      defaultInstructionKey={defaultInstructionKey}
                      defaultPending={setDefaultInstruction.isPending}
                      instruction={instruction}
                      onSetDefault={() => {
                        setDefaultInstruction.reset();
                        setDefaultInstruction.mutate(instruction.key, {
                          onError(cause) {
                            reportError("roleplay-instruction.default.update", cause);
                          },
                        });
                      }}
                    />
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
  instruction: {
    display: "block",
    minHeight: 0,
    padding: 0,
  },
  instructionContent: {
    minWidth: 0,
    padding: "1rem",
  },
  instructionEditSurface: {
    backgroundColor: {
      default: "transparent",
      ":hover": colors.backgroundNeutralSubtler,
      ":is([data-focus-visible])": colors.backgroundNeutralSubtler,
    },
    color: colors.foregroundPrimary,
    minWidth: 0,
    outlineColor: {
      default: null,
      ":is([data-focus-visible])": colors.focusRing,
    },
    outlineOffset: {
      default: null,
      ":is([data-focus-visible])": -2,
    },
    outlineStyle: {
      default: "none",
      ":is([data-focus-visible])": "solid",
    },
    outlineWidth: {
      default: null,
      ":is([data-focus-visible])": 1,
    },
    padding: "1rem",
    textAlign: "start",
    width: "100%",
  },
  instructionHeading: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    minWidth: 0,
  },
  instructionTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  instructionFooter: {
    alignItems: "center",
    borderBlockStartColor: colors.borderSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    display: "flex",
    gap: "1rem",
    justifyContent: "space-between",
    padding: "0.5rem 0.75rem",
  },
  defaultAction: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
    minWidth: 0,
  },
  defaultError: {
    color: colors.foregroundDanger,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
  instructionBody: {
    color: colors.foregroundPrimary,
    display: "-webkit-box",
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginBlock: "1rem 0",
    overflow: "hidden",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
  },
});
