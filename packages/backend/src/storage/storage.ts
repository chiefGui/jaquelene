import { lstat, opendir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { Context, Effect, Layer, Schema, Semaphore } from "effect";

const maximumByteCount = BigInt(Number.MAX_SAFE_INTEGER);

export const StorageCategory = {
  Content: "content",
  Cache: "cache",
  AppData: "app-data",
} as const;

export type StorageCategory = (typeof StorageCategory)[keyof typeof StorageCategory];

export type StorageAreaId = string;

export type StorageArea = Readonly<{
  id: StorageAreaId;
  category: StorageCategory;
  paths: readonly string[];
  delete: Effect.Effect<void, StorageAreaDeleteError>;
}>;

export type StorageAreaUsage = Readonly<{
  id: StorageAreaId;
  category: StorageCategory;
  bytes: number;
}>;

export type StorageUsage = Readonly<{
  areas: readonly StorageAreaUsage[];
}>;

export type StorageDeletion = Readonly<{
  areas: readonly StorageAreaUsage[];
}>;

export class StorageConfigurationError extends Schema.TaggedError<StorageConfigurationError>()(
  "StorageConfigurationError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "Storage areas are invalid.";
  }
}

export class StorageMeasurementError extends Schema.TaggedError<StorageMeasurementError>()(
  "StorageMeasurementError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "Could not measure storage usage.";
  }
}

export class StorageAreaDeleteError extends Schema.TaggedError<StorageAreaDeleteError>()(
  "StorageAreaDeleteError",
  { areaId: Schema.String, cause: Schema.Defect() },
) {
  override get message() {
    return `Could not delete storage area "${this.areaId}".`;
  }
}

export class StorageDeleteError extends Schema.TaggedError<StorageDeleteError>()(
  "StorageDeleteError",
  { message: Schema.String, failures: Schema.NonEmptyArray(StorageAreaDeleteError) },
) {
  override get cause() {
    if (this.failures.length === 1) {
      return this.failures[0];
    }

    return new AggregateError(this.failures, this.message);
  }
}

export class StorageTargetNotFoundError extends Schema.TaggedError<StorageTargetNotFoundError>()(
  "StorageTargetNotFoundError",
  { kind: Schema.Literals(["area", "category"]), id: Schema.String },
) {
  override get message() {
    return `Storage ${this.kind} "${this.id}" does not exist.`;
  }
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

  if (process.platform === "win32") {
    return normalized.toLowerCase();
  }

  return normalized;
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

export function assertStoragePathsAreDisjoint(
  owners: readonly Readonly<{ id: StorageAreaId; paths: readonly string[] }>[],
) {
  const registeredPaths: Array<{ path: string; comparisonKey: string }> = [];

  for (const owner of owners) {
    for (const path of owner.paths) {
      if (!path || !isAbsolute(path)) {
        throw new TypeError(`Storage area "${owner.id}" requires absolute owned paths.`);
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
    }
  }
}

function registerStorageAreas(areas: readonly StorageArea[]) {
  const registeredIds = new Set<StorageAreaId>();
  const categories = new Set<StorageCategory>(Object.values(StorageCategory));

  const registeredAreas = areas.map((area) => {
    if (typeof area.id !== "string" || !area.id.trim()) {
      throw new TypeError("Storage areas require an identity.");
    }

    if (registeredIds.has(area.id)) {
      throw new TypeError(`Storage area "${area.id}" is registered more than once.`);
    }

    registeredIds.add(area.id);

    if (!categories.has(area.category)) {
      throw new TypeError(`Storage area "${area.id}" has an unknown category.`);
    }

    if (!Effect.isEffect(area.delete)) {
      throw new TypeError(`Storage area "${area.id}" requires a delete Effect.`);
    }

    return {
      id: area.id,
      category: area.category,
      paths: [...area.paths],
      delete: area.delete,
    } satisfies StorageArea;
  });

  assertStoragePathsAreDisjoint(registeredAreas);
  return registeredAreas;
}

async function measureAreas(areas: readonly StorageArea[]) {
  const measurements = await Promise.all(
    areas.map(async (area) => ({ area, bytes: await measurePaths(area.paths) })),
  );
  const totalBytes = measurements.reduce((total, measurement) => total + measurement.bytes, 0n);
  assertSupportedByteCount(totalBytes);

  return measurements.map(({ area, bytes }) => ({
    id: area.id,
    category: area.category,
    bytes: Number(bytes),
  }));
}

type StorageServiceShape = Readonly<{
  measureUsage: () => Effect.Effect<StorageUsage, StorageMeasurementError>;
  deleteArea: (
    id: StorageAreaId,
  ) => Effect.Effect<
    StorageDeletion,
    StorageDeleteError | StorageMeasurementError | StorageTargetNotFoundError
  >;
  deleteCategory: (
    id: StorageCategory,
  ) => Effect.Effect<
    StorageDeletion,
    StorageDeleteError | StorageMeasurementError | StorageTargetNotFoundError
  >;
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
          catch: (cause) => new StorageConfigurationError({ cause }),
        });
        const areasByCategory = new Map<StorageCategory, StorageArea[]>(
          Object.values(StorageCategory).map((category) => [category, []]),
        );

        for (const area of registeredAreas) {
          areasByCategory.get(area.category)!.push(area);
        }

        const areasById = new Map(registeredAreas.map((area) => [area.id, area]));
        const semaphore = yield* Semaphore.make(1);
        const measure = (measuredAreas: readonly StorageArea[]) =>
          Effect.tryPromise({
            try: () => measureAreas(measuredAreas),
            catch: (cause) => new StorageMeasurementError({ cause }),
          });
        const deleteRegisteredAreas = Effect.fn("Storage.deleteRegisteredAreas")(function* (
          areas: readonly StorageArea[],
          message: string,
        ) {
          yield* Effect.validate(areas, (area) => area.delete, {
            concurrency: 4,
            discard: true,
          }).pipe(Effect.mapError((failures) => new StorageDeleteError({ message, failures })));

          return { areas: yield* measure(areas) };
        });

        const measureUsage = Effect.fn("Storage.measureUsage")(function* () {
          return { areas: yield* measure(registeredAreas) };
        }, semaphore.withPermits(1));
        const deleteArea = Effect.fn("Storage.deleteArea")(function* (id: StorageAreaId) {
          const area = areasById.get(id);

          if (!area) {
            return yield* new StorageTargetNotFoundError({ kind: "area", id });
          }

          return yield* deleteRegisteredAreas([area], `Could not delete storage area "${id}".`);
        }, semaphore.withPermits(1));
        const deleteCategory = Effect.fn("Storage.deleteCategory")(function* (id: StorageCategory) {
          const areas = areasByCategory.get(id);

          if (!areas) {
            return yield* new StorageTargetNotFoundError({ kind: "category", id });
          }

          return yield* deleteRegisteredAreas(areas, `Could not delete storage category "${id}".`);
        }, semaphore.withPermits(1));

        return StorageService.of({ measureUsage, deleteArea, deleteCategory });
      }),
    );
}
