import type { CustomPrompt } from "@jaquelene/domain";
import { Item, Timestamp } from "@jaquelene/ui";
import { useId } from "react";

export function PromptMetadata({ prompt }: { prompt: CustomPrompt }) {
  const headingId = useId();

  return (
    <Item.Section aria-labelledby={headingId}>
      <Item.SectionHeader>
        <Item.SectionContent>
          <Item.Heading id={headingId}>Metadata</Item.Heading>
        </Item.SectionContent>
      </Item.SectionHeader>

      <Item.Group>
        <Item.Root>
          <Item.Content>
            <Item.Label>Created</Item.Label>
          </Item.Content>
          <Item.Value>
            <Item.ValueText>
              <Timestamp value={prompt.createdAt} />
            </Item.ValueText>
          </Item.Value>
        </Item.Root>

        <Item.Root>
          <Item.Content>
            <Item.Label>Updated</Item.Label>
          </Item.Content>
          <Item.Value>
            <Item.ValueText>
              <Timestamp value={prompt.updatedAt} />
            </Item.ValueText>
          </Item.Value>
        </Item.Root>
      </Item.Group>
    </Item.Section>
  );
}
