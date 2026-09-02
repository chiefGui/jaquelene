import { Field } from "@jaquelene/ui";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import {
  campaignRoleplayInstructionKeyQuery,
  instructionGroupsQuery,
  useIsDefaultRoleplayInstructionPending,
  useSetCampaignRoleplayInstruction,
} from "./query";
import { InstructionSelect, type InstructionSelectOption } from "./select";

export function CampaignRoleplayInstructionControl({ campaignId }: { campaignId: string }) {
  const { data: groups } = useSuspenseQuery(instructionGroupsQuery);
  const { data: instructionKey } = useSuspenseQuery(
    campaignRoleplayInstructionKeyQuery(campaignId),
  );
  const setSelection = useSetCampaignRoleplayInstruction(campaignId);
  const defaultSelectionPending = useIsDefaultRoleplayInstructionPending();
  const controlId = useId();
  const labelId = useId();
  const errorId = useId();
  const instructions = groups.find(({ key }) => key === "roleplay")?.instructions ?? [];
  const selectedInstruction = instructions.find(({ key }) => key === instructionKey);
  const options = instructions.map(
    (instruction) =>
      ({
        description: instruction.body,
        title: instruction.title,
        value: instruction.key,
      }) satisfies InstructionSelectOption,
  );

  if (!instructionKey) {
    throw new Error(`Campaign "${campaignId}" is unavailable.`);
  }

  if (!selectedInstruction) {
    throw new Error(
      `Campaign "${campaignId}" selects unavailable instruction "${instructionKey}".`,
    );
  }

  return (
    <Field.Root style={styles.root}>
      <Field.Label id={labelId} htmlFor={controlId} style={styles.label}>
        Roleplay instruction
      </Field.Label>

      <InstructionSelect
        id={controlId}
        aria-labelledby={labelId}
        {...(setSelection.isError ? { "aria-describedby": errorId } : {})}
        busy={setSelection.isPending || defaultSelectionPending}
        footerAction={{
          label: "Manage instructions",
          render: <Link to="/settings/instructions" preload="render" />,
        }}
        value={instructionKey}
        options={options}
        onValueChange={(nextInstructionKey) => {
          setSelection.reset();
          setSelection.mutate(nextInstructionKey, {
            onError(cause) {
              reportError("campaign.roleplay-instruction.update", cause);
            },
          });
        }}
      />

      {setSelection.isError ? (
        <Field.Error id={errorId} role="alert" style={styles.error}>
          Couldn’t save roleplay instruction.
        </Field.Error>
      ) : null}
    </Field.Root>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "grid",
    gap: "0.5rem 0.75rem",
    gridTemplateColumns: "auto minmax(0, 1fr)",
  },
  label: {
    color: colors.foregroundSecondary,
    fontWeight: 400,
    whiteSpace: "nowrap",
  },
  error: {
    gridColumn: "1 / -1",
  },
});
