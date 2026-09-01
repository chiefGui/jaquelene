import { InstructionOrigin, type Instruction } from "@jaquelene/ipc/renderer";
import { Badge, Item } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { instructionGroupsQuery } from "@/feature/instruction/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/settings/instructions")({
  loader: ({ context }) => context.queryClient.query(instructionGroupsQuery),
  component: InstructionsRoute,
});

function FactoryInstruction({ instruction }: { instruction: Instruction }) {
  if (instruction.origin !== InstructionOrigin.Factory) {
    throw new Error(`Unknown instruction origin "${instruction.origin}".`);
  }

  return (
    <Item.Root style={styles.instruction}>
      <div {...stylex.props(styles.instructionHeader)}>
        <Item.Label>{instruction.name}</Item.Label>
        <Badge>Built-in</Badge>
      </div>

      <p {...stylex.props(styles.content)}>{instruction.content}</p>
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
                <Item.SectionHeader>
                  <Item.Heading id={headingId}>{group.name}</Item.Heading>
                  <Item.SectionDescription id={descriptionId}>
                    {group.description}
                  </Item.SectionDescription>
                </Item.SectionHeader>

                <Item.Group>
                  {group.instructions.map((instruction) => (
                    <FactoryInstruction key={instruction.key} instruction={instruction} />
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
  instruction: {
    display: "block",
  },
  instructionHeader: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  content: {
    color: `color-mix(in oklab, ${colors.foreground} 82%, transparent)`,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginBlock: "1rem 0",
    whiteSpace: "pre-wrap",
  },
});
