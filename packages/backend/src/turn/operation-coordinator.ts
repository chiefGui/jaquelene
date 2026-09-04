import type { GenerationIntent } from "#backend/generation/schema";
import type { GenerationId, MessageId, ThreadId, TurnId } from "#backend/id";

export type ThreadOperationInspection =
  | Readonly<{ state: "idle" }>
  | Readonly<{ state: "submitting" }>
  | Readonly<{ state: "retrying"; turnId: TurnId }>
  | Readonly<{ state: "regenerating"; assistantMessageId: MessageId }>
  | Readonly<{ state: "editing"; messageId: MessageId }>
  | Readonly<{ state: "truncating"; userMessageId: MessageId }>
  | Readonly<{
      state: "generating";
      intent: GenerationIntent;
      turnId: TurnId;
      generationId: GenerationId;
    }>;

export type StartingTurnOperation = Extract<
  ThreadOperationInspection,
  { state: "submitting" | "retrying" | "regenerating" }
>;
type SynchronousThreadOperation = Extract<
  ThreadOperationInspection,
  { state: "editing" | "truncating" }
>;
type AcquiredThreadOperation = StartingTurnOperation | SynchronousThreadOperation;
type ActiveThreadOperation = Exclude<ThreadOperationInspection, { state: "idle" }>;

type ThreadOperationLease = Readonly<{ release: () => void }>;
type GeneratingThreadOperationLease = ThreadOperationLease &
  Readonly<{
    generating: (turnId: TurnId, generationId: GenerationId, intent: GenerationIntent) => void;
  }>;

type OperationEntry = Readonly<{
  owner: symbol;
  operation: ActiveThreadOperation;
}>;

function copyInspection(operation: ActiveThreadOperation): ThreadOperationInspection {
  return { ...operation };
}

export function createThreadOperationCoordinator() {
  const operations = new Map<ThreadId, OperationEntry>();

  function acquire(
    threadId: ThreadId,
    starting: StartingTurnOperation,
  ): GeneratingThreadOperationLease;
  function acquire(threadId: ThreadId, starting: SynchronousThreadOperation): ThreadOperationLease;
  function acquire(
    threadId: ThreadId,
    starting: AcquiredThreadOperation,
  ): GeneratingThreadOperationLease | ThreadOperationLease {
    if (operations.has(threadId)) {
      throw new RangeError(`Thread "${threadId}" already has an active operation.`);
    }

    const owner = Symbol(threadId);
    let released = false;
    operations.set(threadId, { owner, operation: starting });

    function release() {
      if (!released && operations.get(threadId)?.owner === owner) {
        operations.delete(threadId);
      }

      released = true;
    }

    if (starting.state === "editing" || starting.state === "truncating") {
      return { release };
    }

    return {
      generating(turnId: TurnId, generationId: GenerationId, intent: GenerationIntent) {
        const current = operations.get(threadId);

        if (released || current?.owner !== owner) {
          throw new Error(`Thread "${threadId}" operation ownership was lost.`);
        }

        if (current.operation.state === "generating") {
          throw new Error(`Thread "${threadId}" operation is already generating.`);
        }

        operations.set(threadId, {
          owner,
          operation: {
            state: "generating",
            intent,
            turnId,
            generationId,
          },
        });
      },
      release,
    };
  }

  return {
    acquire,

    inspect(threadId: ThreadId): ThreadOperationInspection {
      const active = operations.get(threadId);
      return active ? copyInspection(active.operation) : { state: "idle" };
    },
  };
}
