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
import { instructionGroupsQuery, useDeleteRoleplayInstruction } from "@/feature/instruction/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/settings/instructions")({
  loader: ({ context }) => context.queryClient.query(instructionGroupsQuery),
  component: InstructionsRoute,
});

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
        <Button
          type="button"
          aria-label={`Delete ${instruction.title}`}
          size="small"
          variant="ghost"
          disabled={deleteInstruction.isPending}
        >
          <HugeiconsIcon icon={TrashIcon} size={14} strokeWidth={1.5} aria-hidden="true" />
          <Button.Label>Delete</Button.Label>
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

function InstructionItem({ instruction }: { instruction: Instruction }) {
  if (
    instruction.origin !== InstructionOrigin.Custom &&
    instruction.origin !== InstructionOrigin.Factory
  ) {
    throw new Error(`Unknown instruction origin "${instruction.origin}".`);
  }

  if (instruction.origin === InstructionOrigin.Factory) {
    return (
      <Item.Root style={styles.instruction}>
        <div {...stylex.props(styles.instructionContent)}>
          <InstructionSummary instruction={instruction} />
        </div>
      </Item.Root>
    );
  }

  return (
    <Item.Root style={styles.instruction}>
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

      <div {...stylex.props(styles.instructionFooter)}>
        <DeleteInstruction instruction={instruction} />
      </div>
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
    justifyContent: "flex-end",
    padding: "0.5rem 0.75rem",
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
