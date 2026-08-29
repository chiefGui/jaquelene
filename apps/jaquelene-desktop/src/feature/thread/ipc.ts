import type {
  Generation,
  GenerationFailureKind,
  ThreadMessage,
  Turns,
  TurnSubmission,
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

function toIpcSubmission(submission: TurnSubmission) {
  return {
    turn: { ...submission.turn },
    userMessage: toIpcMessage(submission.userMessage),
    generation: toIpcGeneration(submission.generation),
    ...(submission.assistantMessage
      ? { assistantMessage: toIpcMessage(submission.assistantMessage) }
      : {}),
    assistantActivated: submission.assistantActivated,
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
  submission: TurnSubmission,
) {
  if (!submission.failure) {
    return;
  }

  const stage = unexpectedFailureStage(submission.generation.failureKind);

  if (!stage) {
    return;
  }

  diagnostics.report({
    severity: ErrorSeverity.Error,
    operation,
    error: new Error(`Generation failed during ${stage}.`, {
      cause: submission.failure.cause,
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

  TurnsIpc.for(target).setImplementation({
    async submit(request) {
      const submission = await turns.submit({
        threadId: ids.thread.parse(request.threadId),
        content: request.content,
        model: { ...request.model },
      });
      reportUnexpectedFailure(diagnostics, "thread.turn.submit", submission);
      return toIpcSubmission(submission);
    },
    async retry(request) {
      const submission = await turns.retry({
        turnId: ids.turn.parse(request.turnId),
        model: { ...request.model },
      });
      reportUnexpectedFailure(diagnostics, "thread.turn.retry", submission);
      return toIpcSubmission(submission);
    },
  });
}
