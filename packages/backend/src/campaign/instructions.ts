import type { SkillKindKey } from "@jaquelene/domain";
import type { CampaignId, ThreadId } from "#backend/id";
import type { ResolvedInstruction } from "#backend/model/input";

export type CampaignInstructionContext = Readonly<{
  threadId: ThreadId;
  campaign: Readonly<{
    id: CampaignId;
  }> | null;
}>;

export type CampaignInstructionApplication = Readonly<{
  kind: SkillKindKey;
  apply: (context: CampaignInstructionContext) => readonly ResolvedInstruction[];
}>;

export function createCampaignInstructionRegistry(
  applications: readonly CampaignInstructionApplication[],
) {
  const registered = [...applications];
  const kinds = new Set<SkillKindKey>();

  for (const application of registered) {
    if (kinds.has(application.kind)) {
      throw new TypeError(`Skill kind "${application.kind}" has multiple campaign applications.`);
    }

    kinds.add(application.kind);
  }

  return {
    resolve(context: CampaignInstructionContext): readonly ResolvedInstruction[] {
      return registered.flatMap((application) => application.apply(context));
    },
  };
}

export type CampaignInstructionRegistry = ReturnType<typeof createCampaignInstructionRegistry>;
