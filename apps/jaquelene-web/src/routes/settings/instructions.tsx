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
          {custom ? null : <Badge>Built-in</Badge>}
        </div>

        {custom ? (
          <div {...stylex.props(styles.instructionActions)}>
            <RoleplayInstructionEditor
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
                    <RoleplayInstructionEditor
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
