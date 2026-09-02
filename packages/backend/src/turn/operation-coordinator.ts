import type { GenerationId, MessageId, ThreadId, TurnId } from "#backend/id";

export type TurnOperationInspection =
  | Readonly<{ state: "idle" }>
  | Readonly<{ state: "submitting" }>
  | Readonly<{ state: "retrying"; turnId: TurnId }>
  | Readonly<{ state: "regenerating"; assistantMessageId: MessageId }>
  | Readonly<{ state: "truncating"; userMessageId: MessageId }>
  | Readonly<{
      state: "generating";
      source: "submit" | "retry" | "regenerate";
      turnId: TurnId;
      generationId: GenerationId;
    }>;

export type StartingTurnOperation = Extract<
  TurnOperationInspection,
  { state: "submitting" | "retrying" | "regenerating" }
>;
type TruncatingTurnOperation = Extract<TurnOperationInspection, { state: "truncating" }>;
type AcquiredTurnOperation = StartingTurnOperation | TruncatingTurnOperation;
type ActiveTurnOperation = Exclude<TurnOperationInspection, { state: "idle" }>;

type TurnOperationLease = Readonly<{ release: () => void }>;
type GeneratingTurnOperationLease = TurnOperationLease &
  Readonly<{ generating: (turnId: TurnId, generationId: GenerationId) => void }>;

type OperationEntry = Readonly<{
  owner: symbol;
  operation: ActiveTurnOperation;
}>;

function copyInspection(operation: ActiveTurnOperation): TurnOperationInspection {
  return { ...operation };
}

export function createTurnOperationCoordinator() {
  const operations = new Map<ThreadId, OperationEntry>();

  function acquire(
    threadId: ThreadId,
    starting: StartingTurnOperation,
  ): GeneratingTurnOperationLease;
  function acquire(threadId: ThreadId, starting: TruncatingTurnOperation): TurnOperationLease;
  function acquire(
    threadId: ThreadId,
    starting: AcquiredTurnOperation,
  ): GeneratingTurnOperationLease | TurnOperationLease {
    if (operations.has(threadId)) {
      throw new RangeError(`Thread "${threadId}" already has an active turn operation.`);
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

    if (starting.state === "truncating") {
      return { release };
    }

    return {
      generating(turnId: TurnId, generationId: GenerationId) {
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
            source:
              starting.state === "submitting"
                ? "submit"
                : starting.state === "retrying"
                  ? "retry"
                  : "regenerate",
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

    inspect(threadId: ThreadId): TurnOperationInspection {
      const active = operations.get(threadId);
      return active ? copyInspection(active.operation) : { state: "idle" };
    },
  };
}
