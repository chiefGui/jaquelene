import { lstat, type BigIntStats } from "node:fs";
import { opendir } from "node:fs/promises";
import { Effect, Layer, Path, Predicate } from "effect";
import { FileTreeError, FileTreeService } from "./file-tree";

function statEntry(path: string) {
  return Effect.callback<BigIntStats, FileTreeError>((resume) => {
    const fail = (cause: unknown) =>
      resume(Effect.fail(new FileTreeError({ path, operation: "lstat", cause })));
    try {
      lstat(path, { bigint: true }, (cause, entry) => {
        if (cause) {
          fail(cause);
          return;
        }
        resume(Effect.succeed(entry));
      });
    } catch (cause) {
      fail(cause);
    }
  });
}

// Effect's FileSystem does not expose no-follow stats or streamed directory reads.
export const nodeFileTreeLayer = Layer.effect(
  FileTreeService,
  Effect.gen(function* () {
    const pathService = yield* Path.Path;
    // Fold bytes during traversal; per-file streams and tracing add avoidable overhead.
    const measureBytes = Effect.fnUntraced(
      function* (path: string): Effect.fn.Return<bigint, FileTreeError> {
        const entry = yield* statEntry(path);
        if (entry.isFile()) {
          return entry.size;
        }
        if (!entry.isDirectory()) {
          return 0n;
        }

        return yield* Effect.acquireUseRelease(
          Effect.tryPromise({
            try: () => opendir(path),
            catch: (cause) => new FileTreeError({ path, operation: "opendir", cause }),
          }),
          (directory) =>
            Effect.gen(function* () {
              let bytes = 0n;
              // Native reads cannot be cancelled: settle before closing the handle.
              const readEntry = Effect.tryPromise({
                try: () => directory.read(),
                catch: (cause) => new FileTreeError({ path, operation: "read", cause }),
              }).pipe(Effect.uninterruptible);
              while (true) {
                const child = yield* readEntry;
                if (child === null) {
                  return bytes;
                }
                bytes += yield* measureBytes(pathService.join(path, child.name));
              }
            }),
          (directory) =>
            Effect.tryPromise({
              try: () => directory.close(),
              catch: (cause) => new FileTreeError({ path, operation: "close", cause }),
            }).pipe(Effect.orDie),
        );
      },
      Effect.catchIf(
        (error) => Predicate.hasProperty(error.cause, "code") && error.cause.code === "ENOENT",
        () => Effect.succeed(0n),
      ),
    );

    return FileTreeService.of({ measureBytes });
  }),
);
