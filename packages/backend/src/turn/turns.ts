import type { Database } from "#backend/database/database";
import type { GenerationConfiguration } from "#backend/generation/configuration";
import type {
  AcceptedReplyGeneration,
  GenerationEngine,
  ReplyGenerationExecution,
} from "#backend/generation/generations";
import type { Generation } from "#backend/generation/schema";
import type { MessageId, ThreadId, TurnId } from "#backend/id";
import type { ThreadMessage } from "#backend/thread/schema";
import {
  requireThreadMessageContent,
  type DeleteThreadHistoryRequest,
  type ThreadEngine,
  type ThreadHistoryDeletion,
} from "#backend/thread/threads";
import {
  createTurnOperationCoordinator,
  type StartingTurnOperation,
} from "./operation-coordinator";
export type { TurnOperationInspection } from "./operation-coordinator";
export type { DeleteThreadHistoryRequest, ThreadHistoryDeletion } from "#backend/thread/threads";

type TurnGenerationEngine = Pick<
  GenerationEngine,
  | "acceptRegenerationInTransaction"
  | "acceptReplyInTransaction"
  | "listLatestForTurns"
  | "resolveConfiguration"
> & {
  scheduleAcceptedReply(
    accepted: AcceptedReplyGeneration,
    signal?: AbortSignal,
  ): Promise<ReplyGenerationExecution>;
};
type TurnThreads = Pick<
  ThreadEngine,
  "deleteFrom" | "getMessage" | "getTurnInput" | "listMessages" | "startTurnInTransaction"
>;

type ListThreadRequest = Parameters<TurnThreads["listMessages"]>[0];

export type ThreadActivityPage = ReturnType<TurnThreads["listMessages"]> & {
  generations: Generation[];
};

export type SubmitTurnRequest = {
  threadId: ThreadId;
  content: string;
  configuration: GenerationConfiguration;
  signal?: AbortSignal;
};

export type RetryTurnRequest = {
  turnId: TurnId;
  configuration: GenerationConfiguration;
  signal?: AbortSignal;
};

export type RegenerateReplyRequest = {
  assistantMessageId: MessageId;
  configuration: GenerationConfiguration;
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

function copyConfiguration(configuration: GenerationConfiguration): GenerationConfiguration {
  return {
    model: {
      providerId: configuration.model.providerId,
      modelId: configuration.model.modelId,
    },
    ...(configuration.reasoningPreset === undefined
      ? {}
      : { reasoningPreset: configuration.reasoningPreset }),
  };
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
) {
  const operationCoordinator = createTurnOperationCoordinator();

  async function startExclusive(
    threadId: ThreadId,
    starting: StartingTurnOperation,
    start: () => TurnOperation | Promise<TurnOperation>,
  ) {
    const lease = operationCoordinator.acquire(threadId, starting);

    try {
      const operation = await start();
      lease.generating(
        operation.acceptance.userMessage.turnId,
        operation.acceptance.generation.id,
        operation.acceptance.generation.intent,
      );

      void operation.settlement.then(
        () => lease.release(),
        () => lease.release(),
      );
      return operation;
    } catch (cause) {
      lease.release();
      throw cause;
    }
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
    inspect(threadId: ThreadId) {
      return operationCoordinator.inspect(threadId);
    },

    listForThread(request: ListThreadRequest): ThreadActivityPage {
      const page = threads.listMessages(request);
      const generationsForPage = generations.listLatestForTurns(
        page.messages.map(({ turnId }) => turnId),
      );

      return { ...page, generations: generationsForPage };
    },

    deleteFrom(request: DeleteThreadHistoryRequest): ThreadHistoryDeletion {
      const lease = operationCoordinator.acquire(request.threadId, {
        state: "truncating",
        userMessageId: request.userMessageId,
      });

      try {
        return threads.deleteFrom(request);
      } finally {
        lease.release();
      }
    },

    async submit({
      threadId,
      content,
      configuration: requestedConfiguration,
      signal,
    }: SubmitTurnRequest): Promise<TurnOperation> {
      const configuration = copyConfiguration(requestedConfiguration);
      requireThreadMessageContent(content);
      assertNotAborted(signal);

      return startExclusive(threadId, { state: "submitting" }, async () => {
        const resolvedConfiguration = await generations.resolveConfiguration(configuration, signal);
        assertNotAborted(signal);
        const accepted = database.transaction((transaction) => {
          const { turn, message } = threads.startTurnInTransaction(transaction, threadId, content);
          const acceptedGeneration = generations.acceptReplyInTransaction(
            transaction,
            turn.id,
            "reply",
            resolvedConfiguration,
          );
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

    async retry({
      turnId,
      configuration: requestedConfiguration,
      signal,
    }: RetryTurnRequest): Promise<TurnOperation> {
      const configuration = copyConfiguration(requestedConfiguration);
      assertNotAborted(signal);
      const input = threads.getTurnInput(turnId);

      if (!input) {
        throw new RangeError(`Turn "${turnId}" does not exist.`);
      }

      return startExclusive(input.turn.threadId, { state: "retrying", turnId }, async () => {
        const resolvedConfiguration = await generations.resolveConfiguration(configuration, signal);
        assertNotAborted(signal);
        const latestGeneration = generations.listLatestForTurns([turnId])[0];

        if (latestGeneration?.status !== "failed") {
          throw new RangeError(`Turn "${turnId}" has no failed generation to retry.`);
        }

        const acceptedGeneration = database.transaction((transaction) =>
          generations.acceptReplyInTransaction(transaction, turnId, "retry", resolvedConfiguration),
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

    async regenerate({
      assistantMessageId,
      configuration: requestedConfiguration,
      signal,
    }: RegenerateReplyRequest): Promise<TurnOperation> {
      const configuration = copyConfiguration(requestedConfiguration);
      assertNotAborted(signal);
      const assistantMessage = threads.getMessage(assistantMessageId);

      if (!assistantMessage) {
        throw new RangeError(`Message "${assistantMessageId}" does not exist.`);
      }

      if (assistantMessage.author !== "assistant") {
        throw new TypeError(`Message "${assistantMessageId}" is not an assistant message.`);
      }

      const input = threads.getTurnInput(assistantMessage.turnId);

      if (!input) {
        throw new Error(`Turn "${assistantMessage.turnId}" has no user input.`);
      }

      return startExclusive(
        assistantMessage.threadId,
        { state: "regenerating", assistantMessageId },
        async () => {
          const resolvedConfiguration = await generations.resolveConfiguration(
            configuration,
            signal,
          );
          assertNotAborted(signal);
          const acceptedGeneration = database.transaction((transaction) =>
            generations.acceptRegenerationInTransaction(
              transaction,
              assistantMessageId,
              resolvedConfiguration,
            ),
          );
          const acceptance = {
            userMessage: input.message,
            generation: acceptedGeneration.generation,
          } satisfies TurnAcceptance;

          return {
            acceptance,
            settlement: beginSettlement(acceptance, acceptedGeneration, signal),
          };
        },
      );
    },
  };
}

export type Turns = ReturnType<typeof createTurns>;
