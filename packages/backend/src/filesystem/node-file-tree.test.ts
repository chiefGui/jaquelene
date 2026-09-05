import { Dir, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import * as NodePath from "@effect/platform-node/NodePath";
import { Cause, Effect, Exit, Layer } from "effect";
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

function measureBytes(path: string) {
  return FileTreeService.use((tree) => tree.measureBytes(path));
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
  it("counts exact bytes and closes each directory before visiting its sibling", async () => {
    const directory = createDirectory();
    const firstPath = join(directory, "first");
    const secondPath = join(directory, "second");
    mkdirSync(firstPath);
    mkdirSync(secondPath);
    writeFileSync(join(firstPath, "one"), Buffer.alloc(5));
    writeFileSync(join(secondPath, "two"), Buffer.alloc(7));
    const closedDirectories = trackDirectoryClosures();
    const closedBeforeReading: number[] = [];
    const visited = new Set<string>();
    const read: () => ReturnType<Dir["read"]> = Dir.prototype.read;
    vi.spyOn(Dir.prototype, "read").mockImplementation(function (this: Dir) {
      if (!visited.has(this.path)) {
        visited.add(this.path);
        closedBeforeReading.push(closedDirectories());
      }
      return read.call(this);
    });

    await expect(
      Effect.runPromise(measureBytes(directory).pipe(Effect.provide(layer))),
    ).resolves.toBe(12n);
    expect(closedBeforeReading).toEqual([0, 0, 1]);
    expect(closedDirectories()).toBe(3);
  });

  it("does not open directory handles for a regular file or a missing path", async () => {
    const directory = createDirectory();
    const filePath = join(directory, "file");
    writeFileSync(filePath, Buffer.alloc(11));
    const read = vi.spyOn(Dir.prototype, "read");

    await expect(
      Effect.runPromise(measureBytes(filePath).pipe(Effect.provide(layer))),
    ).resolves.toBe(11n);
    await expect(
      Effect.runPromise(measureBytes(join(directory, "missing")).pipe(Effect.provide(layer))),
    ).resolves.toBe(0n);
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
      Effect.runPromise(measureBytes(directory).pipe(Effect.provide(layer))),
    ).resolves.toBe(3n);
    await expect(
      Effect.runPromise(measureBytes(outsideLink).pipe(Effect.provide(layer))),
    ).resolves.toBe(0n);
  });

  it("reuses a measurement program without retaining previous byte counts", async () => {
    const directory = createDirectory();
    const filePath = join(directory, "file");
    const measurement = measureBytes(directory).pipe(Effect.provide(layer));
    writeFileSync(filePath, Buffer.alloc(5));
    await expect(Effect.runPromise(measurement)).resolves.toBe(5n);
    writeFileSync(filePath, Buffer.alloc(9));
    await expect(Effect.runPromise(measurement)).resolves.toBe(9n);
  });

  it("closes interrupted ancestors without reading the rest of the tree", async () => {
    const directory = createDirectory();
    const nested = join(directory, "nested");
    mkdirSync(nested);
    for (let index = 0; index < 20; index += 1) {
      writeFileSync(join(nested, String(index)), "file");
    }
    const closedDirectories = trackDirectoryClosures();
    const controller = new AbortController();
    const originalRead: () => ReturnType<Dir["read"]> = Dir.prototype.read;
    const read = vi.spyOn(Dir.prototype, "read").mockImplementation(function (this: Dir) {
      if (this.path === nested) controller.abort();
      return originalRead.call(this);
    });
    const result = Effect.runPromiseExit(measureBytes(directory).pipe(Effect.provide(layer)), {
      signal: controller.signal,
    });

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
    const result = Effect.runPromiseExit(measureBytes(directory).pipe(Effect.provide(layer)), {
      signal: controller.signal,
    });

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
    const exit = await Effect.runPromiseExit(measureBytes(directory).pipe(Effect.provide(layer)));

    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({
      _tag: "FileTreeError",
      path: directory,
      operation: "read",
      cause,
    });
    expect(closedDirectories()).toBe(1);
  });

  it("preserves a child cleanup failure while still closing its ancestors", async () => {
    const directory = createDirectory();
    const nested = join(directory, "nested");
    mkdirSync(nested);
    writeFileSync(join(nested, "file"), "file");
    const failure = new Error("Could not close the directory.");
    const closed: string[] = [];
    const closePromise: () => Promise<void> = Dir.prototype.close;
    const closeCallback: (callback: (error: NodeJS.ErrnoException | null) => void) => void =
      Dir.prototype.close;
    vi.spyOn(Dir.prototype, "close").mockImplementation(function (this: Dir, callback) {
      if (callback) return closeCallback.call(this, callback);
      closed.push(this.path);
      return closePromise.call(this).then(() => {
        if (this.path === nested) throw failure;
      });
    });

    const exit = await Effect.runPromiseExit(measureBytes(directory).pipe(Effect.provide(layer)));
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({
      _tag: "FileTreeError",
      path: nested,
      operation: "close",
      cause: failure,
    });
    expect(closed).toEqual([nested, directory]);
  });
});
