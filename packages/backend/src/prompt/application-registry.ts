import type { PromptKindKey } from "@jaquelene/domain";
import type { CampaignId, ThreadId } from "#backend/id";
import type { ResolvedInstruction } from "#backend/model/input";

export type Instruction = Readonly<{
  key: string;
  content: string;
}>;

export type PromptApplicationContext = Readonly<{
  threadId: ThreadId;
  campaign: Readonly<{
    id: CampaignId;
  }> | null;
}>;

export type PromptApplication = Readonly<{
  kind: PromptKindKey;
  apply: (context: PromptApplicationContext) => readonly Instruction[];
}>;

function resolveInstruction(instruction: Instruction): ResolvedInstruction {
  return {
    sourceKey: instruction.key,
    content: instruction.content,
  };
}

export function createPromptApplicationRegistry(applications: readonly PromptApplication[]) {
  const registered = [...applications];
  const kinds = new Set<PromptKindKey>();

  for (const application of registered) {
    if (kinds.has(application.kind)) {
      throw new TypeError(`Prompt kind "${application.kind}" has multiple applications.`);
    }

    kinds.add(application.kind);
  }

  return {
    resolve(context: PromptApplicationContext): readonly ResolvedInstruction[] {
      return registered.flatMap((application) =>
        application.apply(context).map(resolveInstruction),
      );
    },
  };
}

export type PromptApplicationRegistry = ReturnType<typeof createPromptApplicationRegistry>;
