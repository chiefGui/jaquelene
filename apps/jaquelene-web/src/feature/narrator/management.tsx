import { narratorPromptKindKey } from "@jaquelene/domain";
import type { CustomPrompt } from "@jaquelene/ipc/renderer";
import { Item } from "@jaquelene/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { promptDefaultQuery } from "@/feature/prompt/query";
import { PromptDefaultControl } from "@/feature/prompt/default-control";
import { NarratorPromptDeleteAction } from "./delete-action";

type NarratorPromptManagementProps = {
  onDeleted: () => Promise<void>;
  prompt: CustomPrompt;
};

export function NarratorPromptManagement({ onDeleted, prompt }: NarratorPromptManagementProps) {
  const { data: defaultSelection } = useSuspenseQuery(promptDefaultQuery(narratorPromptKindKey));
  const isDefault = defaultSelection.promptKey === prompt.key;

  return (
    <Item.Group aria-label="Narrator prompt management">
      <PromptDefaultControl
        prompt={prompt}
        kindLabel="narrator"
        description="The narrator selected by default for new campaigns."
      />

      <Item.Root>
        <Item.Content>
          <Item.Label>Delete</Item.Label>
          <Item.Description>Permanently remove this narrator prompt.</Item.Description>
        </Item.Content>

        <NarratorPromptDeleteAction isDefault={isDefault} onDeleted={onDeleted} prompt={prompt} />
      </Item.Root>
    </Item.Group>
  );
}
