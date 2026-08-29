import type { GenerationEngine } from "#backend/generation/generations";
import type { ModelReference } from "#backend/generation/provider";
import type { Generation } from "#backend/generation/schema";
import type { ThreadId, TurnId } from "#backend/id";
import type { ThreadMessage, Turn } from "#backend/thread/schema";
import type { ThreadEngine } from "#backend/thread/threads";

type TurnGenerationEngine = Pick<
  GenerationEngine,
  "executeReply" | "listLatestForTurns" | "requireRegisteredModel"
>;
type TurnThreads = Pick<ThreadEngine, "getTurnInput" | "listMessages" | "startTurn">;

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

export type TurnSubmission = {
  turn: Turn;
  userMessage: ThreadMessage;
  generation: Generation;
  assistantMessage: ThreadMessage | null;
  assistantActivated: boolean;
  failure: Readonly<{ cause: unknown }> | null;
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

export function createTurns(threads: TurnThreads, generations: TurnGenerationEngine) {
  const activeThreadOperations = new Set<ThreadId>();

  async function runExclusive<Result>(threadId: ThreadId, operation: () => Promise<Result>) {
    if (activeThreadOperations.has(threadId)) {
      throw new RangeError(`Thread "${threadId}" already has an active turn operation.`);
    }

    activeThreadOperations.add(threadId);

    try {
      return await operation();
    } finally {
      activeThreadOperations.delete(threadId);
    }
  }

  async function generate(
    turn: Turn,
    userMessage: ThreadMessage,
    model: ModelReference,
    signal?: AbortSignal,
  ): Promise<TurnSubmission> {
    const execution = await generations.executeReply({
      turnId: turn.id,
      model,
      ...(signal ? { signal } : {}),
    });

    if (execution.outcome === "failed") {
      return {
        turn,
        userMessage,
        generation: execution.generation,
        assistantMessage: null,
        assistantActivated: false,
        failure: { cause: execution.cause },
      };
    }

    return {
      turn,
      userMessage,
      generation: execution.generation,
      assistantMessage: execution.message,
      assistantActivated: execution.activated,
      failure: null,
    };
  }

  return {
    listForThread(request: ListThreadRequest): ThreadActivityPage {
      const page = threads.listMessages(request);
      const generationsForPage = generations.listLatestForTurns(
        page.messages.map(({ turnId }) => turnId),
      );

      return { ...page, generations: generationsForPage };
    },

    async submit({ threadId, content, model: requestedModel, signal }: SubmitTurnRequest) {
      const model = copyModel(requestedModel);
      generations.requireRegisteredModel(model);
      assertNotAborted(signal);

      return runExclusive(threadId, () => {
        const { turn, message } = threads.startTurn(threadId, content);
        return generate(turn, message, model, signal);
      });
    },

    async retry({ turnId, model: requestedModel, signal }: RetryTurnRequest) {
      const model = copyModel(requestedModel);
      generations.requireRegisteredModel(model);
      assertNotAborted(signal);
      const input = threads.getTurnInput(turnId);

      if (!input) {
        throw new RangeError(`Turn "${turnId}" does not exist.`);
      }

      return runExclusive(input.turn.threadId, () => {
        const latestGeneration = generations.listLatestForTurns([turnId])[0];

        if (latestGeneration?.status !== "failed") {
          throw new RangeError(`Turn "${turnId}" has no failed generation to retry.`);
        }

        return generate(input.turn, input.message, model, signal);
      });
    },
  };
}

export type Turns = ReturnType<typeof createTurns>;
