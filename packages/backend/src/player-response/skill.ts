import { playerResponseSchema, type PlayerResponse, type SkillDescriptor } from "@jaquelene/domain";
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
import { PlayerResponseError } from "./error";

export type PlayerResponseRequest = Readonly<{
  threadId: ThreadId;
  configuration: RequestedModelConfiguration;
}>;

export type PlayerResponseSkill = Skill<PlayerResponseRequest, PlayerResponse>;

export type PlayerResponseDefinition = Readonly<{
  descriptor: SkillDescriptor;
  history: RecentHistoryOptions;
  instructions: string;
}>;

export type PlayerResponseDependencies = Readonly<{
  campaigns: Pick<CampaignEngine, "getContextForThread">;
  history: ThreadHistoryReader;
  modelExecutor: Pick<ModelExecutor, "resolveConfiguration">;
  executeModel: AccountedModelExecution;
}>;

function requireResponseHistory({ head, messages }: RecentHistory) {
  if (!head) {
    throw new PlayerResponseError({ message: "A conversation is needed to generate a response." });
  }
  if (head.author !== "assistant") {
    throw new PlayerResponseError({
      message: "Complete the latest turn before generating a response.",
    });
  }
  if (messages.at(-1)?.id !== head.id) {
    throw new PlayerResponseError({
      message: "The latest turn is too long to generate a response.",
    });
  }
  return messages;
}

export function createPlayerResponseSkill(
  definition: PlayerResponseDefinition,
  { campaigns, history, modelExecutor, executeModel }: PlayerResponseDependencies,
): PlayerResponseSkill {
  function readContext(threadId: ThreadId) {
    const campaign = campaigns.getContextForThread(threadId);
    if (!campaign) {
      throw new PlayerResponseError({ message: "The campaign is no longer available." });
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
    execute: Effect.fn("PlayerResponseSkill.execute")(function* (request) {
      const configuration = yield* modelExecutor.resolveConfiguration(request.configuration);
      const prepared = yield* Effect.try({
        try: () => {
          const context = readContext(request.threadId);
          const messages = requireResponseHistory(context.history);
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
            throw new PlayerResponseError({
              message: "The conversation changed. Generate a new response.",
            });
          }
          const response = playerResponseSchema.safeParse({ text: text.trim() });
          if (!response.success) {
            throw new PlayerResponseError({
              message: "The model returned an unusable response. Try again.",
            });
          }
          return response.data;
        },
        catch: (cause) => cause,
      });
    }),
  };
}
