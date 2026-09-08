import type { SkillId } from "@jaquelene/domain";
import { Effect } from "effect";
import { ids, type ThreadId } from "#backend/id";
import type { CampaignEngine } from "#backend/campaign/campaigns";
import type { ModelExecutor } from "#backend/model/execution";
import type { RequestedModelConfiguration } from "#backend/model/configuration";
import { requireThreadMessageContent } from "#backend/thread/threads";
import type { ThreadHistoryReader } from "#backend/thread/history";
import type { ComposerSkill } from "./types";
import { ComposerSkillError } from "./error";

export type ExecuteComposerSkill = Readonly<{
  skillId: SkillId;
  threadId: ThreadId;
  configuration: RequestedModelConfiguration;
}>;

export function createComposerSkills({
  skills,
  campaigns,
  history,
  modelExecutor,
}: {
  skills: readonly ComposerSkill[];
  campaigns: Pick<CampaignEngine, "getContextForThread">;
  history: ThreadHistoryReader;
  modelExecutor: Pick<ModelExecutor, "resolveConfiguration">;
}) {
  const registry = new Map<SkillId, ComposerSkill>();
  for (const skill of skills) {
    if (registry.has(skill.descriptor.id))
      throw new Error(`Duplicate skill: ${skill.descriptor.id}`);
    registry.set(skill.descriptor.id, skill);
  }

  function readContext(threadId: ThreadId, skill: ComposerSkill) {
    const campaign = campaigns.getContextForThread(threadId);
    if (!campaign)
      throw new ComposerSkillError({ message: "The campaign is no longer available." });
    return { campaign, history: history.readRecent(threadId, skill.history) };
  }

  function snapshot(context: ReturnType<typeof readContext>) {
    return JSON.stringify({
      campaign: context.campaign,
      head: context.history.head,
      messages: context.history.messages,
    });
  }

  return {
    list: () => Array.from(registry.values(), ({ descriptor }) => ({ ...descriptor })),
    execute: Effect.fn("ComposerSkills.execute")(function* (request: ExecuteComposerSkill) {
      const skill = registry.get(request.skillId);
      if (!skill) {
        return yield* new ComposerSkillError({ message: "The composer skill is unavailable." });
      }
      const configuration = yield* modelExecutor.resolveConfiguration(request.configuration);
      const context = yield* Effect.try({
        try: () => readContext(request.threadId, skill),
        catch: (cause) => cause,
      });
      const before = snapshot(context);
      const text = yield* skill.execute({
        executionId: ids.skillExecution.create(),
        configuration,
        context: {
          history: context.history,
          scenario: context.campaign.scenario,
        },
        attribution: { kind: "campaign", id: context.campaign.id },
      });
      return yield* Effect.try({
        try: () => {
          if (snapshot(readContext(request.threadId, skill)) !== before) {
            throw new ComposerSkillError({
              message: "The conversation changed. Generate a new response.",
            });
          }
          try {
            return { text: requireThreadMessageContent(text.trim()) };
          } catch {
            throw new ComposerSkillError({
              message: "The model returned an unusable draft. Try again.",
            });
          }
        },
        catch: (cause) => cause,
      });
    }),
  };
}

export type ComposerSkills = ReturnType<typeof createComposerSkills>;
