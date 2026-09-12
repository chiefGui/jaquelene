import { reactionSchema, type Reaction, type SkillDescriptor } from "@jaquelene/domain";
import { Effect } from "effect";
import type { Skill } from "#backend/skill/skill";
import { ids, type ThreadId } from "#backend/id";
import type { CampaignEngine } from "#backend/campaign/campaigns";
import type { AccountedModelExecution } from "#backend/model/accounted-execution";
import type { RequestedModelConfiguration } from "#backend/model/configuration";
import type { ModelExecutor } from "#backend/model/execution";
import { toModelDialogue, type ModelInput } from "#backend/model/input";
import type {
  RecentHistory,
  RecentHistoryOptions,
  ThreadHistoryReader,
} from "#backend/thread/history";
import { ReactionError } from "./error";

export type ReactionRequest = Readonly<{
  threadId: ThreadId;
  configuration: RequestedModelConfiguration;
}>;

export type ReactionSkill = Skill<ReactionRequest, Reaction>;

export type ReactionDefinition = Readonly<{
  descriptor: SkillDescriptor;
  history: RecentHistoryOptions;
  instructions: string;
}>;

export type ReactionDependencies = Readonly<{
  campaigns: Pick<CampaignEngine, "getContextForThread">;
  history: ThreadHistoryReader;
  modelExecutor: Pick<ModelExecutor, "resolveConfiguration">;
  executeModel: AccountedModelExecution;
}>;

function requireReactionHistory({ head, messages }: RecentHistory) {
  if (!head) {
    throw new ReactionError({ message: "A conversation is needed to generate a reaction." });
  }
  if (head.author !== "assistant") {
    throw new ReactionError({
      message: "Complete the latest turn before generating a reaction.",
    });
  }
  if (messages.at(-1)?.id !== head.id) {
    throw new ReactionError({
      message: "The latest turn is too long to generate a reaction.",
    });
  }
  return messages;
}

export function createReactionSkill(
  definition: ReactionDefinition,
  { campaigns, history, modelExecutor, executeModel }: ReactionDependencies,
): ReactionSkill {
  function readContext(threadId: ThreadId) {
    const campaign = campaigns.getContextForThread(threadId);
    if (!campaign) {
      throw new ReactionError({ message: "The campaign is no longer available." });
    }
    return { campaign, history: history.readRecent(threadId, definition.history) };
  }

  function snapshot(context: ReturnType<typeof readContext>) {
    return JSON.stringify({
      campaign: context.campaign,
      head: context.history.head,
      messages: context.history.messages,
    });
  }

  return {
    descriptor: definition.descriptor,
    execute: Effect.fn("ReactionSkill.execute")(function* (request) {
      const configuration = yield* modelExecutor.resolveConfiguration(request.configuration);
      const prepared = yield* Effect.try({
        try: () => {
          const context = readContext(request.threadId);
          const messages = requireReactionHistory(context.history);
          const requestMessages: NonNullable<ModelInput["requestMessages"]>[number][] = [];
          if (context.campaign.scenario) {
            requestMessages.push({
              role: "user",
              content: `Scenario context:\n## Scenario\n${context.campaign.scenario}`,
            });
          }
          return {
            campaignId: context.campaign.id,
            snapshot: snapshot(context),
            input: {
              dialogue: toModelDialogue(messages),
              requestMessages,
              instructions: [
                {
                  sourceKey: `skill.${definition.descriptor.id}`,
                  content: definition.instructions,
                },
                {
                  sourceKey: "reaction.writing",
                  content:
                    "Match the user's established voice and narrative perspective. Use actions or dialogue as appropriate. Enclose dialogue in double quotation marks. Output only the reaction.",
                },
              ],
            } satisfies ModelInput,
          };
        },
        catch: (cause) => cause,
      });
      const text = yield* executeModel(
        { executionId: ids.skillExecution.create(), configuration, input: prepared.input },
        { kind: "campaign", id: prepared.campaignId },
      );
      return yield* Effect.try({
        try: () => {
          if (snapshot(readContext(request.threadId)) !== prepared.snapshot) {
            throw new ReactionError({
              message: "The conversation changed. Generate a new reaction.",
            });
          }
          const reaction = reactionSchema.safeParse({ text: text.trim() });
          if (!reaction.success) {
            throw new ReactionError({
              message: "The model returned an unusable reaction. Try again.",
            });
          }
          return reaction.data;
        },
        catch: (cause) => cause,
      });
    }),
  };
}
