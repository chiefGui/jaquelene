import type { SkillId } from "@jaquelene/domain";
import { Effect } from "effect";
import { ids, type ThreadId } from "#backend/id";
import type { CampaignEngine } from "#backend/campaign/campaigns";
import type { ModelExecutor } from "#backend/model/execution";
import type { RequestedModelConfiguration } from "#backend/model/configuration";
import { requireThreadMessageContent, type ThreadEngine } from "#backend/thread/threads";
import { readComposerConversation } from "./context";
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
  threads,
  modelExecutor,
}: {
  skills: readonly ComposerSkill[];
  campaigns: Pick<CampaignEngine, "getContextForThread">;
  threads: Pick<ThreadEngine, "getActiveMessagePath">;
  modelExecutor: Pick<ModelExecutor, "resolveConfiguration">;
}) {
  const registry = new Map<SkillId, ComposerSkill>();
  for (const skill of skills) {
    if (registry.has(skill.descriptor.id))
      throw new Error(`Duplicate skill: ${skill.descriptor.id}`);
    registry.set(skill.descriptor.id, skill);
  }

  function readContext(threadId: ThreadId) {
    const campaign = campaigns.getContextForThread(threadId);
    if (!campaign)
      throw new ComposerSkillError({ message: "The campaign is no longer available." });
    const messages = readComposerConversation(threads, threadId);
    return { campaign, messages };
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
        try: () => readContext(request.threadId),
        catch: (cause) => cause,
      });
      const snapshot = JSON.stringify(context);
      const text = yield* skill.execute({
        executionId: ids.skillExecution.create(),
        configuration,
        context: {
          dialogue: context.messages.map(({ id: messageId, author: role, content }) => ({
            messageId,
            role,
            content,
          })),
          requestMessages: context.campaign.instructions.map(({ content }) => ({
            role: "user" as const,
            content: `Scenario context:\n${content}`,
          })),
        },
        attribution: { kind: "campaign", id: context.campaign.id },
      });
      return yield* Effect.try({
        try: () => {
          if (JSON.stringify(readContext(request.threadId)) !== snapshot) {
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
