import type {
  Generation,
  GenerationFailureKind,
  ThreadMessage,
  Turns,
  TurnAcceptance,
  TurnSettlement,
} from "@jaquelene/backend";
import { ids } from "@jaquelene/backend";
import { ErrorSeverity, type ErrorReporter } from "@jaquelene/diagnostics";
import {
  GenerationFailureKind as IpcGenerationFailureKind,
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
    status: toIpcGenerationStatus(generation.status),
    ...(generation.failureKind
      ? { failureKind: toIpcGenerationFailureKind(generation.failureKind) }
      : {}),
    ...(generation.outputMessageId ? { outputMessageId: generation.outputMessageId } : {}),
    startedAt: generation.startedAt,
    ...(generation.finishedAt === null ? {} : { finishedAt: generation.finishedAt }),
  };
}

function toIpcSubmission(acceptance: TurnAcceptance) {
  return {
    userMessage: toIpcMessage(acceptance.userMessage),
    generation: toIpcGeneration(acceptance.generation),
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
  operation: "thread.turn.submit" | "thread.turn.retry",
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

export function createThreadMessaging(turns: Turns, diagnostics: ErrorReporter) {
  const destinations = new Map<WebFrameMain, ITurnsDispatcher>();

  function publishTurnChange(
    operation: "thread.turn.submit" | "thread.turn.retry",
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
          error: new Error("Could not publish turn state.", { cause }),
        });
      }
    }
  }

  function publishSettlement(
    operation: "thread.turn.submit" | "thread.turn.retry",
    settlement: TurnSettlement,
  ) {
    reportUnexpectedFailure(diagnostics, operation, settlement);

    if (settlement.outcome === "failed") {
      const failure = {
        userMessage: toIpcMessage(settlement.userMessage),
        generation: toIpcGeneration(settlement.generation),
      };
      publishTurnChange(operation, (dispatcher) => dispatcher.dispatchReplyFailed(failure));
      return;
    }

    if (!settlement.assistantActivated) {
      const superseded = { threadId: settlement.userMessage.threadId };
      publishTurnChange(operation, (dispatcher) => dispatcher.dispatchReplySuperseded(superseded));
      return;
    }

    const completion = {
      userMessage: toIpcMessage(settlement.userMessage),
      assistantMessage: toIpcMessage(settlement.assistantMessage),
      generation: toIpcGeneration(settlement.generation),
    };
    publishTurnChange(operation, (dispatcher) => dispatcher.dispatchReplyCompleted(completion));
  }

  function observeSettlement(
    operation: "thread.turn.submit" | "thread.turn.retry",
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
