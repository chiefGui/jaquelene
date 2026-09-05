import { Context, Effect, Layer, Path, Schema, Semaphore, Stream } from "effect";
import { FileTreeService } from "#backend/filesystem/file-tree";

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

export class StorageCategoryDeleteError extends Schema.TaggedError<StorageCategoryDeleteError>()(
  "StorageCategoryDeleteError",
  {
    category: Schema.Enum(StorageCategory),
    failures: Schema.NonEmptyArray(StorageAreaDeleteError),
  },
) {
  override get message() {
    return `Could not delete storage category "${this.category}".`;
  }

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

function getPathComparisonKey(pathService: Path.Path, path: string) {
  const normalized = pathService.resolve(path);

  if (pathService.sep === "\\") {
    return normalized.toLowerCase();
  }

  return normalized;
}

function pathContains(pathService: Path.Path, parent: string, candidate: string) {
  const pathFromParent = pathService.relative(parent, candidate);
  return (
    pathFromParent === "" ||
    (pathFromParent !== ".." &&
      !pathFromParent.startsWith(`..${pathService.sep}`) &&
      !pathService.isAbsolute(pathFromParent))
  );
}

function pathsOverlap(pathService: Path.Path, left: string, right: string) {
  return pathContains(pathService, left, right) || pathContains(pathService, right, left);
}

export function assertStoragePathsAreDisjoint(
  pathService: Path.Path,
  owners: readonly Readonly<{ id: StorageAreaId; paths: readonly string[] }>[],
) {
  const registeredPaths: Array<{ path: string; comparisonKey: string }> = [];

  for (const owner of owners) {
    for (const path of owner.paths) {
      if (!path || !pathService.isAbsolute(path)) {
        throw new TypeError(`Storage area "${owner.id}" requires absolute owned paths.`);
      }

      const pathComparisonKey = getPathComparisonKey(pathService, path);
      const overlappingPath = registeredPaths.find(({ comparisonKey }) =>
        pathsOverlap(pathService, comparisonKey, pathComparisonKey),
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

function registerStorageAreas(pathService: Path.Path, areas: readonly StorageArea[]) {
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

  assertStoragePathsAreDisjoint(pathService, registeredAreas);
  return registeredAreas;
}

type StorageServiceShape = Readonly<{
  measureUsage: () => Effect.Effect<StorageUsage, StorageMeasurementError>;
  deleteArea: (
    id: StorageAreaId,
  ) => Effect.Effect<
    StorageDeletion,
    StorageAreaDeleteError | StorageMeasurementError | StorageTargetNotFoundError
  >;
  deleteCategory: (
    id: StorageCategory,
  ) => Effect.Effect<
    StorageDeletion,
    StorageCategoryDeleteError | StorageMeasurementError | StorageTargetNotFoundError
  >;
}>;

export class StorageService extends Context.Service<StorageService, StorageServiceShape>()(
  "@jaquelene/backend/Storage",
) {
  static readonly layer = (areas: readonly StorageArea[]) =>
    Layer.effect(
      StorageService,
      Effect.gen(function* () {
        const pathService = yield* Path.Path;
        const fileTree = yield* FileTreeService;
        const registeredAreas = yield* Effect.try({
          try: () => registerStorageAreas(pathService, areas),
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
        const measure = Effect.fn("Storage.measure")(function* (areas: readonly StorageArea[]) {
          const measurements = yield* Effect.forEach(
            areas,
            Effect.fn(function* (area) {
              const bytes = yield* Stream.fromIterable(area.paths).pipe(
                Stream.flatMap((path) => fileTree.files(path)),
                Stream.runFold(
                  () => 0n,
                  (total, file) => total + file.bytes,
                ),
                Effect.mapError((cause) => new StorageMeasurementError({ cause })),
              );
              return { area, bytes };
            }),
            { concurrency: 4 },
          );
          const totalBytes = measurements.reduce(
            (total, measurement) => total + measurement.bytes,
            0n,
          );

          if (totalBytes > maximumByteCount) {
            return yield* new StorageMeasurementError({
              cause: new RangeError("Storage usage exceeds the maximum supported byte count."),
            });
          }

          return measurements.map(({ area, bytes }) => ({
            id: area.id,
            category: area.category,
            bytes: Number(bytes),
          }));
        });

        const measureUsage = Effect.fn("Storage.measureUsage")(function* () {
          return { areas: yield* measure(registeredAreas) };
        }, semaphore.withPermits(1));
        const deleteArea = Effect.fn("Storage.deleteArea")(function* (id: StorageAreaId) {
          const area = areasById.get(id);

          if (!area) {
            return yield* new StorageTargetNotFoundError({ kind: "area", id });
          }

          yield* area.delete;
          return { areas: yield* measure([area]) };
        }, semaphore.withPermits(1));
        const deleteCategory = Effect.fn("Storage.deleteCategory")(function* (id: StorageCategory) {
          const areas = areasByCategory.get(id);

          if (!areas) {
            return yield* new StorageTargetNotFoundError({ kind: "category", id });
          }

          yield* Effect.validate(areas, (area) => area.delete, {
            concurrency: 4,
            discard: true,
          }).pipe(
            Effect.mapError(
              (failures) => new StorageCategoryDeleteError({ category: id, failures }),
            ),
          );

          return { areas: yield* measure(areas) };
        }, semaphore.withPermits(1));

        return StorageService.of({ measureUsage, deleteArea, deleteCategory });
      }),
    );
}
