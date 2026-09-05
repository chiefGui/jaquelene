import { Context, Effect, Layer, Schema, Semaphore } from "effect";
import { FileTreeService } from "#backend/filesystem/file-tree";
import {
  StorageAreaDeleteError,
  StorageCategory,
  type StorageArea,
  type StorageAreaId,
} from "./area";
import type { StorageRegistry } from "./registry";

const maximumByteCount = BigInt(Number.MAX_SAFE_INTEGER);

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

export class StorageMeasurementError extends Schema.TaggedError<StorageMeasurementError>()(
  "StorageMeasurementError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "Could not measure storage usage.";
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
  static readonly layer = <Requirements>(registry: StorageRegistry<Requirements>) =>
    Layer.effect(
      StorageService,
      Effect.gen(function* () {
        const ownerContext = yield* Effect.context<Requirements>();
        const fileTree = yield* FileTreeService;
        const registeredAreas = registry.areas;
        const areasByCategory = new Map<StorageCategory, StorageArea<Requirements>[]>(
          Object.values(StorageCategory).map((category) => [category, []]),
        );

        for (const area of registeredAreas) {
          areasByCategory.get(area.category)!.push(area);
        }

        const areasById = new Map(registeredAreas.map((area) => [area.id, area]));
        const semaphore = yield* Semaphore.make(1);
        const measure = Effect.fn("Storage.measure")(function* (
          areas: readonly StorageArea<Requirements>[],
        ) {
          const measurements = yield* Effect.forEach(
            areas,
            Effect.fn(function* (area) {
              const bytes = yield* Effect.reduce(
                area.paths,
                () => 0n,
                (total, path) => Effect.map(fileTree.measureBytes(path), (bytes) => total + bytes),
              ).pipe(Effect.mapError((cause) => new StorageMeasurementError({ cause })));
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

          yield* Effect.provideContext(area.delete, ownerContext);
          return { areas: yield* measure([area]) };
        }, semaphore.withPermits(1));
        const deleteCategory = Effect.fn("Storage.deleteCategory")(function* (id: StorageCategory) {
          const areas = areasByCategory.get(id);

          if (!areas) {
            return yield* new StorageTargetNotFoundError({ kind: "category", id });
          }

          yield* Effect.validate(
            areas,
            (area) => Effect.provideContext(area.delete, ownerContext),
            {
              concurrency: 4,
              discard: true,
            },
          ).pipe(
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
