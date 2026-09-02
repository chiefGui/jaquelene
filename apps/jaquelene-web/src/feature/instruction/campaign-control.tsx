import { Select } from "@jaquelene/ui/select";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
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
    <div {...stylex.props(styles.root)}>
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
          variant="ghost"
          aria-label={`Roleplay instruction: ${selectedInstruction.title}`}
          aria-busy={setSelection.isPending || undefined}
          aria-describedby={setSelection.isError ? errorId : undefined}
          disabled={setSelection.isPending}
          style={styles.trigger}
        >
          <Select.Value>{`Roleplay: ${selectedInstruction.title}`}</Select.Value>
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

      {setSelection.isError ? (
        <p id={errorId} role="alert" {...stylex.props(styles.error)}>
          Couldn’t save roleplay instruction.
        </p>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    minWidth: 0,
  },
  trigger: {
    flexShrink: 1,
    maxWidth: "12rem",
    width: "fit-content",
  },
  error: {
    color: colors.foregroundDanger,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
});
