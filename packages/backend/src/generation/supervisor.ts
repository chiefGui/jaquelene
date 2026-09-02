import type { AcceptedReplyGeneration, GenerationEngine } from "./generations";

type ReplyGenerationEngine = Pick<GenerationEngine, "executeAcceptedReply">;

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

  function scheduleAcceptedReply(accepted: AcceptedReplyGeneration, signal?: AbortSignal) {
    if (!acceptingWork) {
      return Promise.reject(new Error("Backend is closed."));
    }

    const executionSignal = operationSignal(signal);
    // Let callers observe durable acceptance before reply preparation or provider work starts.
    const operation = new Promise<void>((resolve) => setImmediate(resolve)).then(() =>
      engine.executeAcceptedReply(accepted, executionSignal),
    );
    return trackOperation(operation);
  }

  function close() {
    if (!closePromise) {
      acceptingWork = false;
      shutdownController.abort(new Error("Backend is closing."));
      closePromise = Promise.allSettled(activeOperations).then(() => undefined);
    }

    return closePromise;
  }

  return {
    scheduleAcceptedReply,
    close,
  };
}
