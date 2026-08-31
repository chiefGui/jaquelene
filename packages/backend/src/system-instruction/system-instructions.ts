import type { CampaignId, ScenarioId, ThreadId } from "#backend/id";
import type { ResolvedInstruction } from "#backend/model/input";

export type SystemInstruction = Readonly<{
  key: string;
  name: string;
  content: string;
}>;

export type SystemInstructionCatalogEntry = SystemInstruction &
  Readonly<{
    origin: "factory";
  }>;

export type SystemInstructionGroup = Readonly<{
  key: string;
  name: string;
  description: string;
  instructions: readonly SystemInstructionCatalogEntry[];
}>;

export type SystemInstructionContext = Readonly<{
  threadId: ThreadId;
  campaign: Readonly<{
    id: CampaignId;
    scenarioId: ScenarioId;
  }> | null;
}>;

export type SystemInstructionSource = Readonly<{
  listGroups: () => readonly SystemInstructionGroup[];
  resolve: (context: SystemInstructionContext) => readonly SystemInstruction[];
}>;

function copyInstruction(
  instruction: SystemInstructionCatalogEntry,
): SystemInstructionCatalogEntry {
  return { ...instruction };
}

function copyGroup(group: SystemInstructionGroup): SystemInstructionGroup {
  return {
    ...group,
    instructions: group.instructions.map(copyInstruction),
  };
}

export function resolveSystemInstruction(instruction: SystemInstruction): ResolvedInstruction {
  return {
    sourceKey: instruction.key,
    content: instruction.content,
  };
}

export function createSystemInstructions(sources: readonly SystemInstructionSource[]) {
  const registered = [...sources];

  return {
    listGroups(): readonly SystemInstructionGroup[] {
      return registered.flatMap((source) => source.listGroups().map(copyGroup));
    },

    resolve(context: SystemInstructionContext): readonly ResolvedInstruction[] {
      return registered.flatMap((source) => source.resolve(context).map(resolveSystemInstruction));
    },
  };
}

export type SystemInstructionEngine = ReturnType<typeof createSystemInstructions>;
export type SystemInstructions = Pick<SystemInstructionEngine, "listGroups">;
