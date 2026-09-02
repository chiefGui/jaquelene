import { Field } from "@jaquelene/ui";
import { Select } from "@jaquelene/ui/select";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useId } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import {
  campaignRoleplayInstructionKeyQuery,
  instructionGroupsQuery,
  useSetCampaignRoleplayInstruction,
} from "./query";

export function CampaignRoleplayInstructionControl({ campaignId }: { campaignId: string }) {
  const { data: groups } = useSuspenseQuery(instructionGroupsQuery);
  const { data: instructionKey } = useSuspenseQuery(
    campaignRoleplayInstructionKeyQuery(campaignId),
  );
  const setSelection = useSetCampaignRoleplayInstruction(campaignId);
  const controlId = useId();
  const errorId = useId();
  const instructions = groups.find(({ key }) => key === "roleplay")?.instructions ?? [];
  const selectedInstruction = instructions.find(({ key }) => key === instructionKey);

  if (!instructionKey) {
    throw new Error(`Campaign "${campaignId}" is unavailable.`);
  }

  if (!selectedInstruction) {
    throw new Error(
      `Campaign "${campaignId}" selects unavailable instruction "${instructionKey}".`,
    );
  }

  return (
    <Field.Root>
      <Field.Label htmlFor={controlId}>Roleplay instruction</Field.Label>

      <Select.Root
        selectedValue={instructionKey}
        setSelectedValue={(nextInstructionKey) => {
          if (nextInstructionKey === instructionKey) {
            return;
          }

          if (!instructions.some(({ key }) => key === nextInstructionKey)) {
            throw new TypeError(`Unknown roleplay instruction "${nextInstructionKey}".`);
          }

          setSelection.reset();
          setSelection.mutate(nextInstructionKey, {
            onError(cause) {
              reportError("campaign.roleplay-instruction.update", cause);
            },
          });
        }}
      >
        <Select
          id={controlId}
          aria-busy={setSelection.isPending || undefined}
          aria-describedby={setSelection.isError ? errorId : undefined}
          disabled={setSelection.isPending}
          style={styles.trigger}
        >
          <Select.Value>{selectedInstruction.title}</Select.Value>
        </Select>

        <Select.Content>
          {instructions.map((instruction) => (
            <Select.Item key={instruction.key} value={instruction.key}>
              <Select.ItemText>{instruction.title}</Select.ItemText>
              <Select.Indicator />
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>

      <Field.Error id={errorId} role={setSelection.isError ? "alert" : undefined}>
        {setSelection.isError ? "Couldn’t save roleplay instruction." : null}
      </Field.Error>
    </Field.Root>
  );
}

const styles = stylex.create({
  trigger: {
    width: "100%",
  },
});
