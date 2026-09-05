import { Dir, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import * as NodePath from "@effect/platform-node/NodePath";
import { Cause, Deferred, Effect, Exit, Layer, Stream } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { FileTreeService } from "./file-tree";
import { nodeFileTreeLayer } from "./node-file-tree";

const directories: string[] = [];
const layer = nodeFileTreeLayer.pipe(Layer.provide(NodePath.layer));

function createDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-file-tree-"));
  directories.push(directory);
  return directory;
}

function files(path: string) {
  return Stream.unwrap(FileTreeService.use((tree) => Effect.succeed(tree.files(path))));
}

function trackDirectoryClosures() {
  const close = vi.spyOn(Dir.prototype, "close");
  // Node's promise overload delegates to the callback overload; count the outer call only.
  return () => close.mock.calls.filter(([callback]) => callback === undefined).length;
}

afterEach(() => {
  vi.restoreAllMocks();

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Node file tree", () => {
  it("streams regular files with exact byte sizes and closes each completed directory", async () => {
    const directory = createDirectory();
    const firstPath = join(directory, "first");
    const secondPath = join(directory, "second");
    mkdirSync(firstPath);
    mkdirSync(secondPath);
    writeFileSync(join(firstPath, "one"), Buffer.alloc(5));
    writeFileSync(join(secondPath, "two"), Buffer.alloc(7));
    const closedDirectories = trackDirectoryClosures();
    const closedBeforeFile: number[] = [];

    const entries = await Effect.runPromise(
      files(directory).pipe(
        Stream.tap(() => Effect.sync(() => closedBeforeFile.push(closedDirectories()))),
        Stream.runCollect,
        Effect.provide(layer),
      ),
    );

    expect(entries).toHaveLength(2);
    expect(entries).toEqual(
      expect.arrayContaining([
        { path: join(firstPath, "one"), bytes: 5n },
        { path: join(secondPath, "two"), bytes: 7n },
      ]),
    );
    expect(closedBeforeFile).toEqual([0, 1]);
    expect(closedDirectories()).toBe(3);
  });

  it("does not open directory handles for a regular file or a missing path", async () => {
    const directory = createDirectory();
    const filePath = join(directory, "file");
    writeFileSync(filePath, Buffer.alloc(11));
    const read = vi.spyOn(Dir.prototype, "read");

    await expect(
      Effect.runPromise(files(filePath).pipe(Stream.runCollect, Effect.provide(layer))),
    ).resolves.toEqual([{ path: filePath, bytes: 11n }]);
    await expect(
      Effect.runPromise(
        files(join(directory, "missing")).pipe(Stream.runCollect, Effect.provide(layer)),
      ),
    ).resolves.toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it("excludes directory links, including links outside the tree and cycles", async () => {
    const directory = createDirectory();
    const external = createDirectory();
    writeFileSync(join(directory, "owned"), Buffer.alloc(3));
    writeFileSync(join(external, "unowned"), Buffer.alloc(100));
    const outsideLink = join(directory, "outside");
    symlinkSync(external, outsideLink, "junction");
    symlinkSync(directory, join(directory, "cycle"), "junction");

    await expect(
      Effect.runPromise(files(directory).pipe(Stream.runCollect, Effect.provide(layer))),
    ).resolves.toEqual([{ path: join(directory, "owned"), bytes: 3n }]);
    await expect(
      Effect.runPromise(files(outsideLink).pipe(Stream.runCollect, Effect.provide(layer))),
    ).resolves.toEqual([]);
  });

  it("closes an interrupted stream without reading the rest of the tree", async () => {
    const directory = createDirectory();
    const nested = join(directory, "nested");
    mkdirSync(nested);
    for (let index = 0; index < 20; index += 1) {
      writeFileSync(join(nested, String(index)), "file");
    }
    const closedDirectories = trackDirectoryClosures();
    const read = vi.spyOn(Dir.prototype, "read");
    const started = Deferred.makeUnsafe<void>();
    const controller = new AbortController();
    const result = Effect.runPromiseExit(
      files(directory).pipe(
        Stream.mapEffect(() =>
          Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
        ),
        Stream.runDrain,
        Effect.provide(layer),
      ),
      { signal: controller.signal },
    );

    await Effect.runPromise(Deferred.await(started));
    controller.abort();
    const exit = await result;

    expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
    expect(closedDirectories()).toBe(2);
  });

  it("waits for an in-flight read before closing an interrupted directory", async () => {
    const directory = createDirectory();
    writeFileSync(join(directory, "file"), "file");
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const read: () => ReturnType<Dir["read"]> = Dir.prototype.read;
    const closedDirectories = trackDirectoryClosures();
    vi.spyOn(Dir.prototype, "read").mockImplementationOnce(async function (this: Dir) {
      const entry = await read.call(this);
      started.resolve();
      await release.promise;
      return entry;
    });
    const controller = new AbortController();
    const result = Effect.runPromiseExit(
      files(directory).pipe(Stream.runDrain, Effect.provide(layer)),
      { signal: controller.signal },
    );

    await started.promise;
    controller.abort();
    await setImmediate();
    expect(closedDirectories()).toBe(0);
    release.resolve();
    const exit = await result;

    expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true);
    expect(closedDirectories()).toBe(1);
  });

  it("preserves read failures and closes the failed directory", async () => {
    const directory = createDirectory();
    const cause = Object.assign(new Error("Access denied."), { code: "EACCES" });
    vi.spyOn(Dir.prototype, "read").mockRejectedValueOnce(cause);
    const closedDirectories = trackDirectoryClosures();
    const exit = await Effect.runPromiseExit(
      files(directory).pipe(Stream.runDrain, Effect.provide(layer)),
    );

    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({
      _tag: "FileTreeError",
      path: directory,
      operation: "read",
      cause,
    });
    expect(closedDirectories()).toBe(1);
  });
});
