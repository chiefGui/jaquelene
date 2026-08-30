import type {
  AcceptedReplyGeneration,
  GenerationEngine,
  Generations,
  GenerateReplyRequest,
  ReplyGenerationExecution,
} from "./generations";

type ReplyGenerationEngine = Pick<GenerationEngine, "executeAcceptedReply" | "executeReply">;

export function superviseGenerations(engine: ReplyGenerationEngine) {
  const shutdownController = new AbortController();
  const activeOperations = new Set<Promise<unknown>>();
  let acceptingWork = true;
  let closePromise: Promise<void> | undefined;

  function operationSignal(signal?: AbortSignal) {
    return signal
      ? AbortSignal.any([signal, shutdownController.signal])
      : shutdownController.signal;
  }

  function trackOperation<Result>(operation: Promise<Result>) {
    activeOperations.add(operation);
    void operation.then(
      () => activeOperations.delete(operation),
      () => activeOperations.delete(operation),
    );
    return operation;
  }

  function executeReply(request: GenerateReplyRequest) {
    if (!acceptingWork) {
      return Promise.reject(new Error("Backend is closed."));
    }

    const signal = operationSignal(request.signal);
    const operation = engine.executeReply({ ...request, signal });
    return trackOperation(operation);
  }

  function scheduleAcceptedReply(accepted: AcceptedReplyGeneration, signal?: AbortSignal) {
    if (!acceptingWork) {
      return Promise.reject(new Error("Backend is closed."));
    }

    const executionSignal = operationSignal(signal);
    const operation = new Promise<ReplyGenerationExecution>((resolve, reject) => {
      // Let callers observe durable acceptance before prompt compilation or provider work starts.
      setImmediate(() => {
        void engine.executeAcceptedReply(accepted, executionSignal).then(resolve, reject);
      });
    });
    return trackOperation(operation);
  }

  const generations: Generations = {
    async generateReply(request: GenerateReplyRequest) {
      const execution = await executeReply(request);

      if (execution.outcome === "failed") {
        throw execution.cause;
      }

      const { outcome: _outcome, ...result } = execution;
      return result;
    },
  };

  return {
    executeReply,
    scheduleAcceptedReply,
    generations,
    close() {
      if (!closePromise) {
        acceptingWork = false;
        shutdownController.abort(new Error("Backend is closing."));
        closePromise = Promise.allSettled(activeOperations).then(() => undefined);
      }

      return closePromise;
    },
  };
}
