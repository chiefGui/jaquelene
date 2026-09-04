import type {
  Generation,
  GenerationFailureKind,
  ThreadActivity,
  ThreadHistoryDeletion,
  ThreadMessage,
  Threads,
  Turns,
  TurnAcceptance,
  TurnSettlement,
} from "@jaquelene/backend";
import { ids } from "@jaquelene/backend";
import { ErrorSeverity, type ErrorReporter } from "@jaquelene/diagnostics";
import {
  GenerationFailureKind as IpcGenerationFailureKind,
  GenerationIntent as IpcGenerationIntent,
  GenerationStatus as IpcGenerationStatus,
  ThreadMessageAuthor as IpcThreadMessageAuthor,
  ThreadMessagePageDirection as IpcThreadMessagePageDirection,
  Threads as ThreadsIpc,
  Turns as TurnsIpc,
  type ITurnsDispatcher,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import {
  fromIpcReasoningPreset,
  toIpcReasoningPreset,
  toIpcReasoningPresetSource,
} from "@/feature/model/reasoning-preset";

type ThreadMessagingTurns = Pick<
  Turns,
  "deleteFrom" | "editMessage" | "listForThread" | "regenerate" | "retry" | "submit"
>;
type ThreadMessagingThreads = Pick<Threads, "getTranscript">;
type TurnGenerationOperation =
  | "thread.reply.regenerate"
  | "thread.turn.retry"
  | "thread.turn.submit";
type ThreadChangeOperation =
  | TurnGenerationOperation
  | "thread.history.delete"
  | "thread.message.edit";

function toIpcAuthor(author: ThreadMessage["author"]) {
  switch (author) {
    case "user":
      return IpcThreadMessageAuthor.User;
    case "assistant":
      return IpcThreadMessageAuthor.Assistant;
  }
}

function fromIpcPageDirection(direction: IpcThreadMessagePageDirection) {
  switch (direction) {
    case IpcThreadMessagePageDirection.Older:
      return "older" as const;
    case IpcThreadMessagePageDirection.Newer:
      return "newer" as const;
  }
}

function toIpcGenerationStatus(status: Generation["status"]) {
  switch (status) {
    case "pending":
      return IpcGenerationStatus.Pending;
    case "completed":
      return IpcGenerationStatus.Completed;
    case "failed":
      return IpcGenerationStatus.Failed;
  }
}

function toIpcGenerationIntent(intent: Generation["intent"]) {
  switch (intent) {
    case "reply":
      return IpcGenerationIntent.Reply;
    case "retry":
      return IpcGenerationIntent.Retry;
    case "regeneration":
      return IpcGenerationIntent.Regeneration;
  }
}

function toIpcGenerationFailureKind(failureKind: GenerationFailureKind) {
  switch (failureKind) {
    case "preparation":
      return IpcGenerationFailureKind.Preparation;
    case "provider":
      return IpcGenerationFailureKind.Provider;
    case "invalid-output":
      return IpcGenerationFailureKind.InvalidOutput;
    case "interrupted":
      return IpcGenerationFailureKind.Interrupted;
    case "storage":
      return IpcGenerationFailureKind.Storage;
  }
}

function toIpcMessage(message: ThreadMessage) {
  return {
    id: message.id,
    threadId: message.threadId,
    turnId: message.turnId,
    sequence: message.sequence,
    author: toIpcAuthor(message.author),
    content: message.content,
    createdAt: message.createdAt,
  };
}

function toIpcGeneration(generation: Generation) {
  return {
    id: generation.id,
    turnId: generation.turnId,
    providerId: generation.providerId,
    modelId: generation.modelId,
    ...(generation.reasoning
      ? {
          reasoning: {
            preset: toIpcReasoningPreset(generation.reasoning.preset),
            source: toIpcReasoningPresetSource(generation.reasoning.source),
          },
        }
      : {}),
    intent: toIpcGenerationIntent(generation.intent),
    status: toIpcGenerationStatus(generation.status),
    ...(generation.failureKind
      ? { failureKind: toIpcGenerationFailureKind(generation.failureKind) }
      : {}),
    ...(generation.outputMessageId ? { outputMessageId: generation.outputMessageId } : {}),
    startedAt: generation.startedAt,
    ...(generation.finishedAt === null ? {} : { finishedAt: generation.finishedAt }),
  };
}

function toIpcThreadActivity(activity: ThreadActivity) {
  return {
    threadId: activity.threadId,
    lastActivityAt: activity.lastActivityAt,
    turnCount: activity.turnCount,
  };
}

function toIpcSubmission(acceptance: TurnAcceptance) {
  return {
    userMessage: toIpcMessage(acceptance.userMessage),
    generation: toIpcGeneration(acceptance.generation),
    threadActivity: toIpcThreadActivity(acceptance.threadActivity),
  };
}

function toIpcHistoryDeletion(deletion: ThreadHistoryDeletion) {
  return {
    threadId: deletion.threadId,
    userMessageId: deletion.userMessageId,
    ...(deletion.activeMessageId === null ? {} : { activeMessageId: deletion.activeMessageId }),
    deletedTurnCount: deletion.deletedTurnCount,
    threadActivity: toIpcThreadActivity(deletion.threadActivity),
  };
}

function unexpectedFailureStage(failureKind: Generation["failureKind"]) {
  switch (failureKind) {
    case "preparation":
      return "reply preparation";
    case "invalid-output":
      return "provider output validation";
    case "storage":
      return "reply storage";
    case "provider":
    case "interrupted":
    case null:
      return null;
  }

  const unsupportedFailureKind: never = failureKind;
  throw new TypeError(`Unsupported generation failure kind: ${String(unsupportedFailureKind)}`);
}

function reportUnexpectedFailure(
  diagnostics: ErrorReporter,
  operation: TurnGenerationOperation,
  settlement: TurnSettlement,
) {
  if (settlement.outcome !== "failed") {
    return;
  }

  const stage = unexpectedFailureStage(settlement.generation.failureKind);

  if (!stage) {
    return;
  }

  diagnostics.report({
    severity: ErrorSeverity.Error,
    operation,
    error: new Error(`Generation failed during ${stage}.`, {
      cause: settlement.failure.cause,
    }),
  });
}

export function createThreadMessaging(
  threads: ThreadMessagingThreads,
  turns: ThreadMessagingTurns,
  diagnostics: ErrorReporter,
) {
  const destinations = new Map<WebFrameMain, ITurnsDispatcher>();

  function publishThreadChange(
    operation: ThreadChangeOperation,
    dispatch: (dispatcher: ITurnsDispatcher) => void,
  ) {
    for (const [target, dispatcher] of destinations) {
      if (target.isDestroyed() || target.detached) {
        destinations.delete(target);
        continue;
      }

      try {
        dispatch(dispatcher);
      } catch (cause) {
        if (target.isDestroyed() || target.detached) {
          destinations.delete(target);
          continue;
        }

        diagnostics.report({
          severity: ErrorSeverity.Error,
          operation: `${operation}.dispatch`,
          error: new Error("Could not publish thread state.", { cause }),
        });
      }
    }
  }

  function publishSettlement(operation: TurnGenerationOperation, settlement: TurnSettlement) {
    reportUnexpectedFailure(diagnostics, operation, settlement);

    if (settlement.outcome === "failed") {
      const failure = {
        userMessage: toIpcMessage(settlement.userMessage),
        generation: toIpcGeneration(settlement.generation),
        threadActivity: toIpcThreadActivity(settlement.threadActivity),
      };
      publishThreadChange(operation, (dispatcher) => dispatcher.dispatchReplyFailed(failure));
      return;
    }

    if (!settlement.assistantActivated) {
      const superseded = { threadId: settlement.userMessage.threadId };
      publishThreadChange(operation, (dispatcher) =>
        dispatcher.dispatchReplySuperseded(superseded),
      );
      return;
    }

    const completion = {
      userMessage: toIpcMessage(settlement.userMessage),
      assistantMessage: toIpcMessage(settlement.assistantMessage),
      generation: toIpcGeneration(settlement.generation),
      threadActivity: toIpcThreadActivity(settlement.threadActivity),
    };
    publishThreadChange(operation, (dispatcher) => dispatcher.dispatchReplyCompleted(completion));
  }

  function observeSettlement(
    operation: TurnGenerationOperation,
    settlement: Promise<TurnSettlement>,
  ) {
    void settlement.then(
      (result) => {
        publishSettlement(operation, result);
      },
      (cause: unknown) => {
        diagnostics.report({
          severity: ErrorSeverity.Error,
          operation,
          error: new Error("An accepted turn could not settle.", { cause }),
        });
      },
    );
  }

  return {
    expose(target: WebFrameMain) {
      ThreadsIpc.for(target).setImplementation({
        getTranscript(threadId) {
          return threads.getTranscript(ids.thread.parse(threadId));
        },
        listMessages(request) {
          const page = turns.listForThread({
            threadId: ids.thread.parse(request.threadId),
            direction: fromIpcPageDirection(request.direction),
            ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
          });

          return {
            ...page,
            messages: page.messages.map(toIpcMessage),
            generations: page.generations.map(toIpcGeneration),
          };
        },
      });

      const dispatcher = TurnsIpc.for(target).setImplementation({
        editMessage(request) {
          const message = toIpcMessage(
            turns.editMessage({
              messageId: ids.message.parse(request.messageId),
              content: request.content,
            }),
          );
          publishThreadChange("thread.message.edit", (destination) =>
            destination.dispatchMessageEdited(message),
          );
          return message;
        },
        deleteFrom(request) {
          const deletion = toIpcHistoryDeletion(
            turns.deleteFrom({
              threadId: ids.thread.parse(request.threadId),
              userMessageId: ids.message.parse(request.userMessageId),
            }),
          );
          publishThreadChange("thread.history.delete", (destination) =>
            destination.dispatchHistoryDeleted(deletion),
          );
          return deletion;
        },
        async submit(request) {
          const operation = await turns.submit({
            threadId: ids.thread.parse(request.threadId),
            content: request.content,
            configuration: {
              model: { ...request.configuration.model },
              ...(request.configuration.reasoningPreset === undefined
                ? {}
                : {
                    reasoningPreset: fromIpcReasoningPreset(request.configuration.reasoningPreset),
                  }),
            },
          });
          observeSettlement("thread.turn.submit", operation.settlement);
          return toIpcSubmission(operation.acceptance);
        },
        async retry(request) {
          const operation = await turns.retry({
            turnId: ids.turn.parse(request.turnId),
            configuration: {
              model: { ...request.configuration.model },
              ...(request.configuration.reasoningPreset === undefined
                ? {}
                : {
                    reasoningPreset: fromIpcReasoningPreset(request.configuration.reasoningPreset),
                  }),
            },
          });
          observeSettlement("thread.turn.retry", operation.settlement);
          return toIpcGeneration(operation.acceptance.generation);
        },
        async regenerate(request) {
          const operation = await turns.regenerate({
            assistantMessageId: ids.message.parse(request.assistantMessageId),
            configuration: {
              model: { ...request.configuration.model },
              ...(request.configuration.reasoningPreset === undefined
                ? {}
                : {
                    reasoningPreset: fromIpcReasoningPreset(request.configuration.reasoningPreset),
                  }),
            },
          });
          observeSettlement("thread.reply.regenerate", operation.settlement);
          return toIpcGeneration(operation.acceptance.generation);
        },
      });
      destinations.set(target, dispatcher);

      return () => {
        if (destinations.get(target) === dispatcher) {
          destinations.delete(target);
        }
      };
    },
  };
}
