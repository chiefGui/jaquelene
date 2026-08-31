import type { Database } from "#backend/database/database";
import type { CampaignEngine } from "#backend/campaign/campaigns";
import type {
  AcceptedReplyGeneration,
  GenerationEngine,
  ReplyGenerationExecution,
} from "#backend/generation/generations";
import type { Generation } from "#backend/generation/schema";
import type { ThreadId, TurnId } from "#backend/id";
import type { ModelReference } from "#backend/provider/provider";
import type { ThreadMessage } from "#backend/thread/schema";
import type { ThreadEngine } from "#backend/thread/threads";

type TurnGenerationEngine = Pick<
  GenerationEngine,
  "acceptReplyInTransaction" | "listLatestForTurns" | "requireRegisteredModel"
> & {
  scheduleAcceptedReply(
    accepted: AcceptedReplyGeneration,
    signal?: AbortSignal,
  ): Promise<ReplyGenerationExecution>;
};
type TurnThreads = Pick<ThreadEngine, "getTurnInput" | "listMessages" | "startTurnInTransaction">;
type TurnCampaigns = Pick<CampaignEngine, "recordContinuationInTransaction">;

type ListThreadRequest = Parameters<TurnThreads["listMessages"]>[0];

export type ThreadActivityPage = ReturnType<TurnThreads["listMessages"]> & {
  generations: Generation[];
};

export type SubmitTurnRequest = {
  threadId: ThreadId;
  content: string;
  model: ModelReference;
  signal?: AbortSignal;
};

export type RetryTurnRequest = {
  turnId: TurnId;
  model: ModelReference;
  signal?: AbortSignal;
};

export type TurnAcceptance = {
  userMessage: ThreadMessage;
  generation: Generation;
};

export type TurnSettlement =
  | (TurnAcceptance & {
      outcome: "failed";
      failure: Readonly<{ cause: unknown }>;
    })
  | (TurnAcceptance & {
      outcome: "completed";
      assistantMessage: ThreadMessage;
      assistantActivated: boolean;
    });

export type TurnOperation = {
  acceptance: TurnAcceptance;
  settlement: Promise<TurnSettlement>;
};

function copyModel({ providerId, modelId }: ModelReference): ModelReference {
  return { providerId, modelId };
}

function assertNotAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Turn operation was interrupted.", { cause: signal.reason });
  }
}

function settleTurn(
  acceptance: TurnAcceptance,
  execution: ReplyGenerationExecution,
): TurnSettlement {
  if (execution.outcome === "failed") {
    return {
      ...acceptance,
      outcome: "failed",
      generation: execution.generation,
      failure: { cause: execution.cause },
    };
  }

  return {
    ...acceptance,
    outcome: "completed",
    generation: execution.generation,
    assistantMessage: execution.message,
    assistantActivated: execution.activated,
  };
}

export function createTurns(
  database: Database,
  threads: TurnThreads,
  generations: TurnGenerationEngine,
  campaigns: TurnCampaigns,
) {
  const activeThreadOperations = new Set<ThreadId>();

  function startExclusive(threadId: ThreadId, start: () => TurnOperation) {
    if (activeThreadOperations.has(threadId)) {
      throw new RangeError(`Thread "${threadId}" already has an active turn operation.`);
    }

    activeThreadOperations.add(threadId);

    let operation: TurnOperation;

    try {
      operation = start();
    } catch (cause) {
      activeThreadOperations.delete(threadId);
      throw cause;
    }

    void operation.settlement.then(
      () => activeThreadOperations.delete(threadId),
      () => activeThreadOperations.delete(threadId),
    );
    return operation;
  }

  function beginSettlement(
    acceptance: TurnAcceptance,
    acceptedGeneration: AcceptedReplyGeneration,
    signal?: AbortSignal,
  ) {
    return generations
      .scheduleAcceptedReply(acceptedGeneration, signal)
      .then((execution) => settleTurn(acceptance, execution));
  }

  return {
    listForThread(request: ListThreadRequest): ThreadActivityPage {
      const page = threads.listMessages(request);
      const generationsForPage = generations.listLatestForTurns(
        page.messages.map(({ turnId }) => turnId),
      );

      return { ...page, generations: generationsForPage };
    },

    submit({ threadId, content, model: requestedModel, signal }: SubmitTurnRequest): TurnOperation {
      const model = copyModel(requestedModel);
      generations.requireRegisteredModel(model);
      assertNotAborted(signal);

      return startExclusive(threadId, () => {
        const accepted = database.transaction((transaction) => {
          const { turn, message } = threads.startTurnInTransaction(transaction, threadId, content);
          const acceptedGeneration = generations.acceptReplyInTransaction(
            transaction,
            turn.id,
            model,
          );
          campaigns.recordContinuationInTransaction(transaction, threadId);
          const acceptance = {
            userMessage: message,
            generation: acceptedGeneration.generation,
          } satisfies TurnAcceptance;

          return { acceptance, acceptedGeneration };
        });

        return {
          acceptance: accepted.acceptance,
          settlement: beginSettlement(accepted.acceptance, accepted.acceptedGeneration, signal),
        };
      });
    },

    retry({ turnId, model: requestedModel, signal }: RetryTurnRequest): TurnOperation {
      const model = copyModel(requestedModel);
      generations.requireRegisteredModel(model);
      assertNotAborted(signal);
      const input = threads.getTurnInput(turnId);

      if (!input) {
        throw new RangeError(`Turn "${turnId}" does not exist.`);
      }

      return startExclusive(input.turn.threadId, () => {
        const latestGeneration = generations.listLatestForTurns([turnId])[0];

        if (latestGeneration?.status !== "failed") {
          throw new RangeError(`Turn "${turnId}" has no failed generation to retry.`);
        }

        const acceptedGeneration = database.transaction((transaction) =>
          generations.acceptReplyInTransaction(transaction, turnId, model),
        );
        const acceptance = {
          userMessage: input.message,
          generation: acceptedGeneration.generation,
        } satisfies TurnAcceptance;

        return {
          acceptance,
          settlement: beginSettlement(acceptance, acceptedGeneration, signal),
        };
      });
    },
  };
}

export type Turns = ReturnType<typeof createTurns>;
