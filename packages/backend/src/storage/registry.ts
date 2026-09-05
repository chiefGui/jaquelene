import { Effect, Path, Schema } from "effect";
import { StorageCategory, type StorageArea, type StorageAreaId } from "./area";

export class StorageConfigurationError extends Schema.TaggedError<StorageConfigurationError>()(
  "StorageConfigurationError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "Storage areas are invalid.";
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

function assertPathsAreDisjoint(
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
      const overlappingPath = registeredPaths.find(
        ({ comparisonKey }) =>
          pathContains(pathService, comparisonKey, pathComparisonKey) ||
          pathContains(pathService, pathComparisonKey, comparisonKey),
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

export class StorageRegistry<Requirements = never> {
  readonly #areas: readonly StorageArea<Requirements>[];

  private constructor(areas: readonly StorageArea<Requirements>[]) {
    this.#areas = areas;
    Object.freeze(this);
  }

  get areas() {
    return this.#areas;
  }

  static readonly make = Effect.fn("StorageRegistry.make")(function* <Requirements>(
    areas: readonly StorageArea<Requirements>[],
  ) {
    const pathService = yield* Path.Path;
    return yield* Effect.try({
      try: () => {
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

          return Object.freeze({
            id: area.id,
            category: area.category,
            paths: Object.freeze([...area.paths]),
            delete: area.delete,
          });
        });

        assertPathsAreDisjoint(pathService, registeredAreas);
        return new StorageRegistry(Object.freeze(registeredAreas));
      },
      catch: (cause) => new StorageConfigurationError({ cause }),
    });
  });
}
