import { lstat, opendir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { Context, Effect, Layer, Semaphore } from "effect";

const maximumByteCount = BigInt(Number.MAX_SAFE_INTEGER);

export const StorageCategory = {
  Content: "content",
  AppData: "app-data",
} as const;

export type StorageCategory = (typeof StorageCategory)[keyof typeof StorageCategory];

export const StorageAreaId = {
  Content: "content",
  FavoriteModels: "favorite-models",
  LocalState: "local-state",
  OpenRouterConnection: "openrouter-connection",
  Preferences: "preferences",
} as const;

export type StorageAreaId = (typeof StorageAreaId)[keyof typeof StorageAreaId];

export type StorageArea = Readonly<{
  id: StorageAreaId;
  category: StorageCategory;
  paths: readonly string[];
  delete: () => Promise<void> | void;
}>;

export type StorageCategoryUsage = Readonly<{
  id: StorageCategory;
  bytes: number;
}>;

export type StorageUsage = Readonly<{
  categories: readonly StorageCategoryUsage[];
}>;

export type Storage = Readonly<{
  measureUsage: () => Promise<StorageUsage>;
  deleteCategory: (id: StorageCategory) => Promise<StorageUsage>;
}>;

class StorageConfigurationError extends Error {
  override readonly name = "StorageConfigurationError";

  constructor(cause: unknown) {
    super("Storage areas are invalid.", { cause });
  }
}

class StorageMeasurementError extends Error {
  override readonly name = "StorageMeasurementError";

  constructor(cause: unknown) {
    super("Could not measure storage usage.", { cause });
  }
}

class StorageCategoryDeleteError extends Error {
  override readonly name = "StorageCategoryDeleteError";
}

function isMissing(error: unknown) {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function measurePath(path: string): Promise<bigint> {
  try {
    const entry = await lstat(path, { bigint: true });

    if (entry.isFile()) {
      return entry.size;
    }

    if (!entry.isDirectory()) {
      return 0n;
    }

    const directory = await opendir(path);
    let totalBytes = 0n;

    for await (const child of directory) {
      totalBytes += await measurePath(join(path, child.name));
    }

    return totalBytes;
  } catch (error) {
    if (isMissing(error)) {
      return 0n;
    }

    throw error;
  }
}

async function measurePaths(paths: readonly string[]) {
  const measurements = await Promise.all(paths.map(measurePath));
  return measurements.reduce((totalBytes, bytes) => totalBytes + bytes, 0n);
}

function assertSupportedByteCount(bytes: bigint) {
  if (bytes > maximumByteCount) {
    throw new RangeError("Storage usage exceeds the maximum supported byte count.");
  }
}

function getPathComparisonKey(path: string) {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function pathContains(parent: string, candidate: string) {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === "" ||
    (pathFromParent !== ".." &&
      !pathFromParent.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromParent))
  );
}

function pathsOverlap(left: string, right: string) {
  return pathContains(left, right) || pathContains(right, left);
}

function registerStorageAreas(areas: readonly StorageArea[]) {
  const areaIds = new Set<StorageAreaId>(Object.values(StorageAreaId));
  const registeredIds = new Set<StorageAreaId>();
  const registeredPaths: Array<{ path: string; comparisonKey: string }> = [];
  const categories = new Set<StorageCategory>(Object.values(StorageCategory));

  return areas.map((area) => {
    if (!areaIds.has(area.id)) {
      throw new TypeError(`Storage area "${area.id}" has an unknown identity.`);
    }

    if (registeredIds.has(area.id)) {
      throw new TypeError(`Storage area "${area.id}" is registered more than once.`);
    }

    registeredIds.add(area.id);

    if (!categories.has(area.category)) {
      throw new TypeError(`Storage area "${area.id}" has an unknown category.`);
    }

    if (typeof area.delete !== "function") {
      throw new TypeError(`Storage area "${area.id}" requires a delete operation.`);
    }

    const paths = area.paths.map((path) => {
      if (!path || !isAbsolute(path)) {
        throw new TypeError(`Storage area "${area.id}" requires absolute owned paths.`);
      }

      const pathComparisonKey = getPathComparisonKey(path);
      const overlappingPath = registeredPaths.find(({ comparisonKey }) =>
        pathsOverlap(comparisonKey, pathComparisonKey),
      );

      if (overlappingPath?.comparisonKey === pathComparisonKey) {
        throw new TypeError(`Storage path "${path}" is registered more than once.`);
      }

      if (overlappingPath) {
        throw new TypeError(`Storage paths "${overlappingPath.path}" and "${path}" overlap.`);
      }

      registeredPaths.push({ path, comparisonKey: pathComparisonKey });
      return path;
    });

    return {
      id: area.id,
      category: area.category,
      paths,
      delete: area.delete,
    } satisfies StorageArea;
  });
}

async function measureUsage(areas: readonly StorageArea[]): Promise<StorageUsage> {
  const measurements = await Promise.all(
    areas.map(async (area) => ({ area, bytes: await measurePaths(area.paths) })),
  );
  const totalBytes = measurements.reduce((total, measurement) => total + measurement.bytes, 0n);
  assertSupportedByteCount(totalBytes);
  const bytesByCategory = new Map<StorageCategory, bigint>(
    Object.values(StorageCategory).map((category) => [category, 0n]),
  );

  for (const { area, bytes } of measurements) {
    bytesByCategory.set(area.category, bytesByCategory.get(area.category)! + bytes);
  }

  return {
    categories: Object.values(StorageCategory).map((category) => ({
      id: category,
      bytes: Number(bytesByCategory.get(category)),
    })),
  };
}

async function deleteAreas(areas: readonly StorageArea[]) {
  const results = await Promise.allSettled(
    areas.map((area) => Promise.resolve().then(area.delete)),
  );
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );

  if (failures.length === 1) {
    throw failures[0];
  }

  if (failures.length > 1) {
    throw new AggregateError(failures, "Multiple storage owners failed to delete their data.");
  }
}

type StorageServiceShape = Readonly<{
  measureUsage: () => Effect.Effect<StorageUsage, StorageMeasurementError>;
  deleteCategory: (
    id: StorageCategory,
  ) => Effect.Effect<StorageUsage, StorageCategoryDeleteError | StorageMeasurementError>;
}>;

export class StorageService extends Context.Service<StorageService, StorageServiceShape>()(
  "@jaquelene/backend/Storage",
) {
  static readonly layer = (areas: readonly StorageArea[]) =>
    Layer.effect(
      StorageService,
      Effect.gen(function* () {
        const registeredAreas = yield* Effect.try({
          try: () => registerStorageAreas(areas),
          catch: (cause) => new StorageConfigurationError(cause),
        });
        const areasByCategory = new Map<StorageCategory, StorageArea[]>(
          Object.values(StorageCategory).map((category) => [category, []]),
        );

        for (const area of registeredAreas) {
          areasByCategory.get(area.category)!.push(area);
        }

        const semaphore = yield* Semaphore.make(1);
        const measure = () =>
          Effect.tryPromise({
            try: () => measureUsage(registeredAreas),
            catch: (cause) => new StorageMeasurementError(cause),
          });

        return StorageService.of({
          measureUsage: () => semaphore.withPermits(1)(measure()),
          deleteCategory: (id) =>
            semaphore.withPermits(1)(
              Effect.gen(function* () {
                const areas = areasByCategory.get(id);

                if (!areas) {
                  return yield* Effect.fail(
                    new StorageCategoryDeleteError(`Storage category "${id}" does not exist.`),
                  );
                }

                yield* Effect.tryPromise({
                  try: () => deleteAreas(areas),
                  catch: (cause) =>
                    new StorageCategoryDeleteError(`Could not delete storage category "${id}".`, {
                      cause,
                    }),
                });

                return yield* measure();
              }),
            ),
        });
      }),
    );
}
