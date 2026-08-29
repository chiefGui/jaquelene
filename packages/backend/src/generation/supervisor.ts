import type { GenerationEngine, Generations, GenerateReplyRequest } from "./generations";

type ReplyGenerationEngine = Pick<GenerationEngine, "executeReply">;

export function superviseGenerations(engine: ReplyGenerationEngine) {
  const shutdownController = new AbortController();
  const activeOperations = new Set<Promise<unknown>>();
  let acceptingWork = true;
  let closePromise: Promise<void> | undefined;

  function executeReply(request: GenerateReplyRequest) {
    if (!acceptingWork) {
      return Promise.reject(new Error("Backend is closed."));
    }

    const signal = request.signal
      ? AbortSignal.any([request.signal, shutdownController.signal])
      : shutdownController.signal;
    const operation = engine.executeReply({ ...request, signal });
    activeOperations.add(operation);
    void operation.then(
      () => activeOperations.delete(operation),
      () => activeOperations.delete(operation),
    );
    return operation;
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
