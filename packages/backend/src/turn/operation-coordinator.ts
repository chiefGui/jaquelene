import type { GenerationId, MessageId, ThreadId, TurnId } from "#backend/id";

export type TurnOperationInspection =
  | Readonly<{ state: "idle" }>
  | Readonly<{ state: "submitting" }>
  | Readonly<{ state: "retrying"; turnId: TurnId }>
  | Readonly<{ state: "truncating"; userMessageId: MessageId }>
  | Readonly<{
      state: "generating";
      source: "submit" | "retry";
      turnId: TurnId;
      generationId: GenerationId;
    }>;

export type StartingTurnOperation = Extract<
  TurnOperationInspection,
  { state: "submitting" | "retrying" | "truncating" }
>;
type ActiveTurnOperation = Exclude<TurnOperationInspection, { state: "idle" }>;

type OperationEntry = Readonly<{
  owner: symbol;
  operation: ActiveTurnOperation;
}>;

function copyInspection(operation: ActiveTurnOperation): TurnOperationInspection {
  return { ...operation };
}

export function createTurnOperationCoordinator() {
  const operations = new Map<ThreadId, OperationEntry>();

  return {
    acquire(threadId: ThreadId, starting: StartingTurnOperation) {
      if (operations.has(threadId)) {
        throw new RangeError(`Thread "${threadId}" already has an active turn operation.`);
      }

      const owner = Symbol(threadId);
      let released = false;
      operations.set(threadId, { owner, operation: starting });

      return {
        generating(turnId: TurnId, generationId: GenerationId) {
          const current = operations.get(threadId);

          if (released || current?.owner !== owner) {
            throw new Error(`Thread "${threadId}" operation ownership was lost.`);
          }

          if (current.operation.state === "generating") {
            throw new Error(`Thread "${threadId}" operation is already generating.`);
          }

          if (starting.state === "truncating") {
            throw new Error(`Thread "${threadId}" truncation cannot begin a generation.`);
          }

          operations.set(threadId, {
            owner,
            operation: {
              state: "generating",
              source: starting.state === "submitting" ? "submit" : "retry",
              turnId,
              generationId,
            },
          });
        },

        release() {
          if (!released && operations.get(threadId)?.owner === owner) {
            operations.delete(threadId);
          }

          released = true;
        },
      };
    },

    inspect(threadId: ThreadId): TurnOperationInspection {
      const active = operations.get(threadId);
      return active ? copyInspection(active.operation) : { state: "idle" };
    },
  };
}
