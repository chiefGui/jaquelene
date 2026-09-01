import type { CampaignId, ScenarioId, ThreadId } from "#backend/id";
import type { ResolvedInstruction } from "#backend/model/input";

export type Instruction = Readonly<{
  key: string;
  name: string;
  content: string;
}>;

export type CatalogInstruction = Instruction &
  Readonly<{
    origin: "factory";
  }>;

export type InstructionGroup = Readonly<{
  key: string;
  name: string;
  description: string;
  instructions: readonly CatalogInstruction[];
}>;

export type InstructionContext = Readonly<{
  threadId: ThreadId;
  campaign: Readonly<{
    id: CampaignId;
    scenarioId: ScenarioId;
  }> | null;
}>;

export type InstructionSource = Readonly<{
  listGroups: () => readonly InstructionGroup[];
  resolve: (context: InstructionContext) => readonly Instruction[];
}>;

function copyInstruction(instruction: CatalogInstruction): CatalogInstruction {
  return { ...instruction };
}

function copyGroup(group: InstructionGroup): InstructionGroup {
  return {
    ...group,
    instructions: group.instructions.map(copyInstruction),
  };
}

function resolveInstruction(instruction: Instruction): ResolvedInstruction {
  return {
    sourceKey: instruction.key,
    content: instruction.content,
  };
}

export function createInstructionRegistry(sources: readonly InstructionSource[]) {
  const registered = [...sources];

  return {
    listGroups(): readonly InstructionGroup[] {
      return registered.flatMap((source) => source.listGroups().map(copyGroup));
    },

    resolve(context: InstructionContext): readonly ResolvedInstruction[] {
      return registered.flatMap((source) => source.resolve(context).map(resolveInstruction));
    },
  };
}

export type InstructionRegistry = ReturnType<typeof createInstructionRegistry>;
export type InstructionCatalog = Pick<InstructionRegistry, "listGroups">;
