import * as NodePath from "@effect/platform-node/NodePath";
import { Cause, Context, Effect, Exit, Layer, Path } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import { StorageCategory, type StorageArea } from "./area";
import { StorageRegistry } from "./registry";

function area(id: string, paths: readonly string[] = []): StorageArea {
  return { id, category: StorageCategory.AppData, paths, delete: Effect.void };
}

async function register<Requirements>(
  areas: readonly StorageArea<Requirements>[],
  pathLayer: Layer.Layer<Path.Path> = NodePath.layerPosix,
) {
  const exit = await Effect.runPromiseExit(
    StorageRegistry.make(areas).pipe(Effect.provide(pathLayer)),
  );
  if (Exit.isFailure(exit)) {
    throw Cause.squash(exit.cause);
  }
  return exit.value;
}

describe("storage registry", () => {
  it("accepts an empty inventory", async () => {
    await expect(register([])).resolves.toMatchObject({ areas: [] });
  });

  it("snapshots and freezes ownership without running deletion", async () => {
    const deleteOwner = vi.fn();
    const paths = ["/data/preferences"];
    const declaration = { ...area("preferences", paths), delete: Effect.sync(deleteOwner) };
    const declarations: StorageArea[] = [declaration];
    const registry = await register(declarations);
    paths.push("/unowned");
    declaration.id = "changed";
    declarations.push(area("extra"));

    expect(registry.areas).toEqual([
      { ...area("preferences", ["/data/preferences"]), delete: declaration.delete },
    ]);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.areas)).toBe(true);
    expect(Object.isFrozen(registry.areas[0])).toBe(true);
    expect(Object.isFrozen(registry.areas[0]!.paths)).toBe(true);
    expect(deleteOwner).not.toHaveBeenCalled();
  });

  it("preserves deletion requirements without acquiring owner services", async () => {
    class Owner extends Context.Service<Owner, { readonly clear: Effect.Effect<void> }>()(
      "test/RegistryOwner",
    ) {}
    const deletion = Owner.use((owner) => owner.clear);
    const registry = await register([{ ...area("owner"), delete: deletion }]);

    expect(registry.areas[0]!.delete).toBe(deletion);
  });

  it.each(["", "   "])("rejects missing identity %j", async (id) => {
    await expect(register([area(id)])).rejects.toMatchObject({
      _tag: "StorageConfigurationError",
      cause: { message: "Storage areas require an identity." },
    });
  });

  it("rejects duplicate identities even without owned files", async () => {
    await expect(register([area("same"), area("same")])).rejects.toMatchObject({
      _tag: "StorageConfigurationError",
      cause: { message: 'Storage area "same" is registered more than once.' },
    });
  });

  it("rejects invalid categories and deletion programs", async () => {
    await expect(
      register([{ ...area("owner"), category: "unknown" as StorageCategory }]),
    ).rejects.toMatchObject({
      _tag: "StorageConfigurationError",
      cause: { message: 'Storage area "owner" has an unknown category.' },
    });
    await expect(
      register([
        { ...area("owner"), delete: (() => undefined) as unknown as StorageArea["delete"] },
      ]),
    ).rejects.toMatchObject({
      _tag: "StorageConfigurationError",
      cause: { message: 'Storage area "owner" requires a delete Effect.' },
    });
  });

  it.each(["", "data/cache"])("rejects non-absolute ownership %j", async (path) => {
    await expect(register([area("owner", [path])])).rejects.toMatchObject({
      _tag: "StorageConfigurationError",
      cause: { message: 'Storage area "owner" requires absolute owned paths.' },
    });
  });

  it.each([
    [area("first", ["/data/cache", "/data/cache"])],
    [area("first", ["/data/cache"]), area("second", ["/data/other/../cache/"])],
  ])("rejects repeated normalized paths", async (...areas) => {
    await expect(register(areas)).rejects.toMatchObject({
      _tag: "StorageConfigurationError",
      cause: { message: expect.stringContaining("is registered more than once") },
    });
  });

  it.each([
    ["/data/cache", "/data/cache/child"],
    ["/data/cache/child", "/data/cache/"],
  ])("rejects ancestor overlap for %s and %s", async (first, second) => {
    await expect(
      register([area("first", [first]), area("second", [second])]),
    ).rejects.toMatchObject({
      _tag: "StorageConfigurationError",
      cause: { message: expect.stringContaining("overlap") },
    });
  });

  it("preserves POSIX case sensitivity and separates sibling paths", async () => {
    const areas = [
      area("first", ["/data/cache"]),
      area("second", ["/data/Cache", "/data/cache-backup"]),
    ];
    await expect(register(areas)).resolves.toMatchObject({ areas });
  });

  it("uses Windows normalization and case rules independently of the host", async () => {
    await expect(
      register(
        [area("first", ["C:\\data\\cache"]), area("second", ["c:/DATA/other/../cache"])],
        NodePath.layerWin32,
      ),
    ).rejects.toMatchObject({
      cause: { message: expect.stringContaining("is registered more than once") },
    });
    await expect(
      register(
        [area("first", ["C:\\data\\cache"]), area("second", ["c:/DATA/cache/child"])],
        NodePath.layerWin32,
      ),
    ).rejects.toMatchObject({
      cause: { message: expect.stringContaining("overlap") },
    });
    const areas = [
      area("first", ["C:\\data\\cache"]),
      area("second", ["C:\\data\\cache-backup", "D:\\data\\cache"]),
    ];
    await expect(register(areas, NodePath.layerWin32)).resolves.toMatchObject({ areas });
  });
});
