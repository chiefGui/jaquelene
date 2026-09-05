import { Context, Schema, type Stream } from "effect";

export type FileEntry = Readonly<{ path: string; bytes: bigint }>;

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
    /** Streams regular files without following symbolic-link entries. Missing paths are empty. */
    readonly files: (path: string) => Stream.Stream<FileEntry, FileTreeError>;
  }
>()("@jaquelene/backend/FileTree") {}
