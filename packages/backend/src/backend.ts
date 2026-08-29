import { Cause, Exit, ManagedRuntime } from "effect";
import { StorageService, type Storage, type StorageManifest } from "./storage/storage";

export type BackendOptions = Readonly<{
  storageManifest: StorageManifest;
}>;

export type Backend = Readonly<{
  storage: Storage;
  close: () => Promise<void>;
}>;

function asError(cause: unknown, message: string) {
  return cause instanceof Error ? cause : new Error(message, { cause });
}

async function unwrapExit<A, E>(exitPromise: Promise<Exit.Exit<A, E>>) {
  const exit = await exitPromise;

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  throw asError(Cause.squash(exit.cause), "Backend operation failed.");
}

export async function createBackend({ storageManifest }: BackendOptions): Promise<Backend> {
  const runtime = ManagedRuntime.make(StorageService.layer(storageManifest));

  try {
    await runtime.context();
  } catch (cause) {
    try {
      await runtime.dispose();
    } catch (disposeCause) {
      throw new AggregateError(
        [cause, disposeCause],
        "Could not close the backend after it failed to start.",
      );
    }

    throw asError(cause, "Could not start the backend.");
  }

  const measureStorageUsage = StorageService.use((storage) => storage.measureUsage());
  let closePromise: Promise<void> | undefined;

  return {
    storage: {
      measureUsage() {
        if (closePromise) {
          return Promise.reject(new Error("Backend is closed."));
        }

        return unwrapExit(runtime.runPromiseExit(measureStorageUsage));
      },
    },
    close() {
      closePromise ??= runtime.dispose();
      return closePromise;
    },
  };
}
