import type { Dir } from "node:fs";
import { lstat, opendir } from "node:fs/promises";
import { Effect, Layer, Path, Predicate, Stream } from "effect";
import { FileTreeError, FileTreeService, type FileEntry } from "./file-tree";

// Effect's FileSystem does not expose no-follow stats or streamed directory reads.
export const nodeFileTreeLayer = Layer.effect(
  FileTreeService,
  Effect.gen(function* () {
    const pathService = yield* Path.Path;
    // Tracing each entry adds measurable overhead; storage requests carry the trace.
    const readEntry = Effect.fnUntraced(function* (directory: Dir) {
      const entry = yield* Effect.tryPromise({
        try: () => directory.read(),
        catch: (cause) => new FileTreeError({ path: directory.path, operation: "read", cause }),
      }).pipe(Effect.uninterruptible);

      if (entry === null) {
        return undefined;
      }

      return [pathService.join(directory.path, entry.name), directory] as const;
    });

    function files(path: string): Stream.Stream<FileEntry, FileTreeError> {
      return Stream.fromEffect(
        Effect.tryPromise({
          try: () => lstat(path, { bigint: true }),
          catch: (cause) => new FileTreeError({ path, operation: "lstat", cause }),
        }),
      ).pipe(
        Stream.flatMap((entry) => {
          if (entry.isFile()) {
            return Stream.succeed({ path, bytes: entry.size });
          }

          if (!entry.isDirectory()) {
            return Stream.empty;
          }

          return Stream.unwrap(
            Effect.gen(function* () {
              const directory = yield* Effect.acquireRelease(
                Effect.tryPromise({
                  try: () => opendir(path),
                  catch: (cause) => new FileTreeError({ path, operation: "opendir", cause }),
                }),
                (directory) =>
                  Effect.tryPromise({
                    try: () => directory.close(),
                    catch: (cause) => new FileTreeError({ path, operation: "close", cause }),
                  }).pipe(Effect.orDie),
              );

              // Depth-first traversal keeps one handle per ancestor, not per discovered directory.
              // Each read settles before scope cleanup can close its handle.
              return Stream.unfold(directory, readEntry).pipe(Stream.flatMap(files));
            }),
          );
        }),
        Stream.catchIf(
          (error) => Predicate.hasProperty(error.cause, "code") && error.cause.code === "ENOENT",
          () => Stream.empty,
        ),
      );
    }

    return FileTreeService.of({ files });
  }),
);
