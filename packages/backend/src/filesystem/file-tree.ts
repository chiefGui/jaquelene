import { Context, Schema, type Effect } from "effect";

export class FileTreeError extends Schema.TaggedError<FileTreeError>()("FileTreeError", {
  path: Schema.String,
  operation: Schema.Literals(["lstat", "opendir", "read", "close"]),
  cause: Schema.Defect(),
}) {
  override get message() {
    return `Could not ${this.operation} "${this.path}".`;
  }
}

export class FileTreeService extends Context.Service<
  FileTreeService,
  {
    /** Counts regular-file bytes without following symbolic-link entries. Missing paths count as zero. */
    readonly measureBytes: (path: string) => Effect.Effect<bigint, FileTreeError>;
  }
>()("@jaquelene/backend/FileTree") {}
