import type { Generations, GenerateReplyRequest } from "./generations";

type GenerationEngine = Readonly<{
  generateReply: Generations["generateReply"];
}>;

export function superviseGenerations(engine: GenerationEngine) {
  const shutdownController = new AbortController();
  const activeOperations = new Set<Promise<unknown>>();
  let acceptingWork = true;
  let closePromise: Promise<void> | undefined;

  const generations: Generations = {
    generateReply(request: GenerateReplyRequest) {
      if (!acceptingWork) {
        return Promise.reject(new Error("Backend is closed."));
      }

      const signal = request.signal
        ? AbortSignal.any([request.signal, shutdownController.signal])
        : shutdownController.signal;
      const operation = engine.generateReply({ ...request, signal });
      activeOperations.add(operation);
      void operation.then(
        () => activeOperations.delete(operation),
        () => activeOperations.delete(operation),
      );
      return operation;
    },
  };

  return {
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
