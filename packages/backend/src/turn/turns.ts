import { Cause, Deferred, Effect, Exit, Fiber, FiberSet, Schema } from "effect";
import type { Database } from "#backend/database/database";
import { parseRegenerationInstructions } from "@jaquelene/domain";
import type { RequestedModelConfiguration } from "#backend/model/configuration";
import type { ResolvedModelConfiguration } from "#backend/model/execution";
import type {
  AcceptedGeneration,
  GenerationEngine,
  GenerationExecution,
} from "#backend/generation/generations";
import type { Generation } from "#backend/generation/schema";
import type { MessageId, ThreadId, TurnId } from "#backend/id";
import type { ThreadMessage } from "#backend/thread/schema";
import {
  requireThreadMessageContent,
  type DeleteThreadHistoryRequest,
  type EditThreadMessageRequest,
  type ThreadActivity,
  type ThreadEngine,
  type ThreadHistoryDeletion,
} from "#backend/thread/threads";
import {
  createThreadOperationCoordinator,
  type StartingTurnOperation,
} from "./operation-coordinator";
export type { ThreadOperationInspection } from "./operation-coordinator";
export type {
  DeleteThreadHistoryRequest,
  EditThreadMessageRequest,
  ThreadHistoryDeletion,
} from "#backend/thread/threads";

type TurnGenerationEngine = Pick<
  GenerationEngine,
  | "acceptRegenerationInTransaction"
  | "acceptReplyInTransaction"
  | "listLatestForTurns"
  | "resolveConfiguration"
  | "executeAccepted"
>;
type TurnThreads = Pick<
  ThreadEngine,
  | "deleteFrom"
  | "editMessage"
  | "getMessage"
  | "getTurnInput"
  | "listMessages"
  | "startTurnInTransaction"
>;

type ListThreadRequest = Parameters<TurnThreads["listMessages"]>[0];

export type ThreadActivityPage = ReturnType<TurnThreads["listMessages"]> & {
  generations: Generation[];
};

export type SubmitTurnRequest = {
  threadId: ThreadId;
  content: string;
  configuration: RequestedModelConfiguration;
};

export type RetryTurnRequest = {
  turnId: TurnId;
  configuration: RequestedModelConfiguration;
};

export type RegenerateReplyRequest = {
  assistantMessageId: MessageId;
  configuration: RequestedModelConfiguration;
  instructions?: string;
};

export type GenerationAcceptance = {
  sourceMessage: ThreadMessage;
  generation: Generation;
  threadActivity: ThreadActivity;
};

export type GenerationSettlement =
  | (GenerationAcceptance & {
      outcome: "failed";
      failure: Readonly<{ cause: unknown }>;
    })
  | (GenerationAcceptance & {
      outcome: "completed";
      assistantMessage: ThreadMessage;
      assistantActivated: boolean;
    });

export type GenerationOperation = {
  acceptance: GenerationAcceptance;
  settlement: Effect.Effect<GenerationSettlement, unknown>;
  cancel: Effect.Effect<void>;
};

export type TurnAcceptance = Omit<GenerationAcceptance, "sourceMessage"> & {
  userMessage: ThreadMessage;
};

export type TurnOperation = Omit<GenerationOperation, "acceptance"> & {
  acceptance: TurnAcceptance;
};

export class TurnAdmissionError extends Schema.TaggedError<TurnAdmissionError>()(
  "TurnAdmissionError",
  { cause: Schema.Defect() },
) {
  override get message() {
    if (this.cause instanceof Error) {
      return this.cause.message;
    }
    return "Could not accept the turn.";
  }
}

function admissionError(cause: unknown) {
  return new TurnAdmissionError({ cause });
}

function copyRequestedModelConfiguration(
  configuration: RequestedModelConfiguration,
): RequestedModelConfiguration {
  const copy: {
    model: RequestedModelConfiguration["model"];
    reasoningPreset?: NonNullable<RequestedModelConfiguration["reasoningPreset"]>;
  } = {
    model: {
      providerId: configuration.model.providerId,
      modelId: configuration.model.modelId,
    },
  };

  if (configuration.reasoningPreset !== undefined) {
    copy.reasoningPreset = configuration.reasoningPreset;
  }

  return copy;
}

function settleGeneration(
  acceptance: GenerationAcceptance,
  execution: GenerationExecution,
): GenerationSettlement {
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
    assistantActivated: execution.threadActivity !== null,
    threadActivity: execution.threadActivity ?? acceptance.threadActivity,
  };
}

export const createTurns = Effect.fn("Turns.make")(function* (
  database: Database,
  threads: TurnThreads,
  generations: TurnGenerationEngine,
) {
  const context = yield* Effect.context<never>();
  const operations = yield* FiberSet.make<void, unknown>();
  const operationCoordinator = createThreadOperationCoordinator();
  let closed = false;

  function requireOpen() {
    if (closed) {
      throw new Error("Turn service is closed.");
    }
  }

  const interruptOperations = Effect.fnUntraced(function* (
    fibers: Iterable<Fiber.Fiber<unknown, unknown>>,
  ) {
    const active = [...fibers];
    yield* Fiber.interruptAll(active);
    const exits = yield* Effect.forEach(active, Fiber.await);
    const reasons = exits.flatMap((exit) => {
      if (Exit.isSuccess(exit)) {
        return [];
      }
      return exit.cause.reasons.filter((reason) => !Cause.isInterruptReason(reason));
    });
    if (reasons.length > 0) {
      return yield* Effect.failCause(Cause.fromReasons(reasons));
    }
  }, Effect.uninterruptible);

  yield* Effect.addFinalizer(() =>
    Effect.suspend(() => {
      closed = true;
      return interruptOperations(operations).pipe(Effect.orDie);
    }),
  );

  type AcceptedOperation = {
    acceptance: GenerationAcceptance;
    acceptedGeneration: AcceptedGeneration;
  };

  const startExclusive = Effect.fnUntraced(function* (
    threadId: ThreadId,
    starting: StartingTurnOperation,
    configuration: RequestedModelConfiguration,
    accept: (configuration: ResolvedModelConfiguration) => AcceptedOperation,
  ): Effect.fn.Return<GenerationOperation, TurnAdmissionError> {
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const lease = yield* Effect.try({
          try: () => {
            requireOpen();
            return operationCoordinator.acquire(threadId, starting);
          },
          catch: admissionError,
        });
        const accepted = yield* Deferred.make<GenerationAcceptance, TurnAdmissionError>();
        const settled = yield* Deferred.make<GenerationSettlement, unknown>();
        const work = Effect.gen(function* () {
          const admission = yield* Effect.exit(
            Effect.gen(function* () {
              // Register lifetime ownership before configuration can call back into the application.
              yield* Effect.interruptible(Effect.yieldNow);
              const resolved = yield* Effect.interruptible(
                generations
                  .resolveConfiguration(configuration)
                  .pipe(Effect.mapError(admissionError)),
              );
              // The transaction and transfer to reply execution are one cancellation-safe handoff.
              return yield* Effect.try({ try: () => accept(resolved), catch: admissionError });
            }),
          );
          if (Exit.isFailure(admission)) {
            yield* Deferred.failCause(accepted, admission.cause);
            return yield* Effect.failCause(admission.cause);
          }
          const { acceptance, acceptedGeneration } = admission.value;
          lease.generating(acceptance.generation.id, acceptance.generation.intent);
          yield* Deferred.succeed(accepted, acceptance);
          const execution = yield* generations.executeAccepted(acceptedGeneration);
          return settleGeneration(acceptance, execution);
        }).pipe(
          Effect.ensuring(Effect.sync(() => lease.release())),
          Effect.exit,
          Effect.flatMap((exit) =>
            Deferred.done(settled, exit).pipe(Effect.andThen(Exit.asVoid(exit))),
          ),
          Effect.uninterruptible,
          Effect.provide(context),
        );
        const fiber = yield* FiberSet.run(operations, work);
        const acceptance = yield* restore(Deferred.await(accepted)).pipe(
          Effect.onInterrupt(() => interruptOperations([fiber]).pipe(Effect.orDie)),
        );
        return {
          acceptance,
          settlement: Deferred.await(settled),
          cancel: interruptOperations([fiber]).pipe(Effect.orDie),
        };
      }),
    );
  });

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
      requireOpen();
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

    editMessage(request: EditThreadMessageRequest): ThreadMessage {
      requireOpen();
      requireThreadMessageContent(request.content);
      const message = threads.getMessage(request.messageId);

      if (!message) {
        throw new RangeError(`Message "${request.messageId}" does not exist.`);
      }

      const lease = operationCoordinator.acquire(message.threadId, {
        state: "editing",
        messageId: request.messageId,
      });

      try {
        return threads.editMessage(request);
      } finally {
        lease.release();
      }
    },

    submit: Effect.fn("Turns.submit")(function* ({
      threadId,
      content,
      configuration: requestedConfiguration,
    }: SubmitTurnRequest) {
      const configuration = yield* Effect.try({
        try: () => {
          requireThreadMessageContent(content);
          return copyRequestedModelConfiguration(requestedConfiguration);
        },
        catch: admissionError,
      });

      const operation = yield* startExclusive(
        threadId,
        { state: "submitting" },
        configuration,
        (resolvedConfiguration) => {
          return database.transaction((transaction) => {
            const { turn, message, activity } = threads.startTurnInTransaction(
              transaction,
              threadId,
              content,
            );
            const acceptedGeneration = generations.acceptReplyInTransaction(
              transaction,
              turn.id,
              "reply",
              resolvedConfiguration,
            );
            const acceptance = {
              sourceMessage: message,
              generation: acceptedGeneration.generation,
              threadActivity: activity,
            } satisfies GenerationAcceptance;

            return { acceptance, acceptedGeneration };
          });
        },
      );
      const { sourceMessage, ...acceptance } = operation.acceptance;
      return {
        ...operation,
        acceptance: { ...acceptance, userMessage: sourceMessage },
      } satisfies TurnOperation;
    }),

    retry: Effect.fn("Turns.retry")(function* ({
      turnId,
      configuration: requestedConfiguration,
    }: RetryTurnRequest) {
      const { configuration, input } = yield* Effect.try({
        try: () => {
          const configuration = copyRequestedModelConfiguration(requestedConfiguration);
          const input = threads.getTurnInput(turnId);
          if (!input) {
            throw new RangeError(`Turn "${turnId}" does not exist.`);
          }
          return { configuration, input };
        },
        catch: admissionError,
      });

      return yield* startExclusive(
        input.turn.threadId,
        { state: "retrying", turnId },
        configuration,
        (resolvedConfiguration) => {
          const latestGeneration = generations.listLatestForTurns([turnId])[0];

          if (latestGeneration?.status !== "failed") {
            throw new RangeError(`Turn "${turnId}" has no failed generation to retry.`);
          }

          const acceptedGeneration = database.transaction((transaction) =>
            generations.acceptReplyInTransaction(
              transaction,
              turnId,
              "retry",
              resolvedConfiguration,
            ),
          );
          const acceptance = {
            sourceMessage: input.message,
            generation: acceptedGeneration.generation,
            threadActivity: input.activity,
          } satisfies GenerationAcceptance;

          return { acceptance, acceptedGeneration };
        },
      );
    }),

    regenerate: Effect.fn("Turns.regenerate")(function* ({
      assistantMessageId,
      configuration: requestedConfiguration,
      instructions: requestedInstructions,
    }: RegenerateReplyRequest) {
      const { configuration, assistantMessage, instructions } = yield* Effect.try({
        try: () => {
          const configuration = copyRequestedModelConfiguration(requestedConfiguration);
          const instructions = parseRegenerationInstructions(requestedInstructions);
          const assistantMessage = threads.getMessage(assistantMessageId);

          if (!assistantMessage) {
            throw new RangeError(`Message "${assistantMessageId}" does not exist.`);
          }

          if (assistantMessage.author !== "assistant") {
            throw new TypeError(`Message "${assistantMessageId}" is not an assistant message.`);
          }

          return { configuration, assistantMessage, instructions };
        },
        catch: admissionError,
      });

      return yield* startExclusive(
        assistantMessage.threadId,
        { state: "regenerating", assistantMessageId },
        configuration,
        (resolvedConfiguration) => {
          const acceptedGeneration = database.transaction((transaction) =>
            generations.acceptRegenerationInTransaction(
              transaction,
              assistantMessageId,
              resolvedConfiguration,
              instructions,
            ),
          );
          const acceptance = {
            sourceMessage: assistantMessage,
            generation: acceptedGeneration.generation,
            threadActivity: acceptedGeneration.threadActivity,
          } satisfies GenerationAcceptance;

          return { acceptance, acceptedGeneration };
        },
      );
    }),
  };
});

export type Turns = Effect.Success<ReturnType<typeof createTurns>>;
