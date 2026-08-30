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
  Threads as ThreadsIpc,
  Turns as TurnsIpc,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";

function toIpcAuthor(author: ThreadMessage["author"]) {
  switch (author) {
    case "user":
      return IpcThreadMessageAuthor.User;
    case "assistant":
      return IpcThreadMessageAuthor.Assistant;
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
    case "prompt":
      return IpcGenerationFailureKind.Prompt;
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
    status: toIpcGenerationStatus(generation.status),
    ...(generation.failureKind
      ? { failureKind: toIpcGenerationFailureKind(generation.failureKind) }
      : {}),
    ...(generation.outputMessageId ? { outputMessageId: generation.outputMessageId } : {}),
    startedAt: generation.startedAt,
    ...(generation.finishedAt === null ? {} : { finishedAt: generation.finishedAt }),
  };
}

function toIpcAcceptance(acceptance: TurnAcceptance) {
  return {
    turn: { ...acceptance.turn },
    userMessage: toIpcMessage(acceptance.userMessage),
    generation: toIpcGeneration(acceptance.generation),
  };
}

function toIpcSettlement(settlement: TurnSettlement) {
  return {
    ...toIpcAcceptance(settlement),
    ...(settlement.assistantMessage
      ? { assistantMessage: toIpcMessage(settlement.assistantMessage) }
      : {}),
    assistantActivated: settlement.assistantActivated,
  };
}

function unexpectedFailureStage(failureKind: Generation["failureKind"]) {
  switch (failureKind) {
    case "prompt":
      return "prompt compilation";
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
  if (!settlement.failure) {
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

export function exposeThreadMessaging(
  target: WebFrameMain,
  turns: Turns,
  diagnostics: ErrorReporter,
) {
  ThreadsIpc.for(target).setImplementation({
    listMessages(request) {
      const page = turns.listForThread({
        ...request,
        threadId: ids.thread.parse(request.threadId),
      });

      return {
        ...page,
        messages: page.messages.map(toIpcMessage),
        generations: page.generations.map(toIpcGeneration),
      };
    },
  });

  const dispatcher = TurnsIpc.for(target).setImplementation({
    submit(request) {
      const operation = turns.submit({
        threadId: ids.thread.parse(request.threadId),
        content: request.content,
        model: { ...request.model },
      });
      observeSettlement("thread.turn.submit", operation.settlement);
      return toIpcAcceptance(operation.acceptance);
    },
    retry(request) {
      const operation = turns.retry({
        turnId: ids.turn.parse(request.turnId),
        model: { ...request.model },
      });
      observeSettlement("thread.turn.retry", operation.settlement);
      return toIpcAcceptance(operation.acceptance);
    },
  });

  function observeSettlement(
    operation: "thread.turn.submit" | "thread.turn.retry",
    settlement: Promise<TurnSettlement>,
  ) {
    void settlement.then(
      (result) => {
        reportUnexpectedFailure(diagnostics, operation, result);

        if (target.isDestroyed() || target.detached) {
          return;
        }

        try {
          dispatcher.dispatchSettled(toIpcSettlement(result));
        } catch (cause) {
          if (target.isDestroyed() || target.detached) {
            return;
          }

          diagnostics.report({
            severity: ErrorSeverity.Error,
            operation: `${operation}.dispatch`,
            error: new Error("Could not publish settled turn state.", { cause }),
          });
        }
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
}
