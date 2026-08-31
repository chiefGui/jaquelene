import {
  type StorageAreaUsage,
  type StorageCategory,
  type StorageDeletion,
  type StorageUsage,
} from "@jaquelene/ipc/renderer";

export type StorageDeletionTarget =
  | Readonly<{ kind: "area"; id: string }>
  | Readonly<{ kind: "category"; id: StorageCategory }>;

function describeTarget(target: StorageDeletionTarget) {
  return `storage ${target.kind} "${target.id}"`;
}

function getExpectedAreas(
  usage: StorageUsage,
  currentAreas: ReadonlyMap<string, StorageAreaUsage>,
  target: StorageDeletionTarget,
) {
  if (target.kind === "category") {
    return usage.areas.filter((area) => area.category === target.id);
  }

  const area = currentAreas.get(target.id);

  if (!area) {
    throw new Error(`Cannot delete unknown storage area "${target.id}".`);
  }

  return [area];
}

export function reconcileStorageDeletion(
  usage: StorageUsage,
  deletion: StorageDeletion,
  target: StorageDeletionTarget,
): StorageUsage {
  const currentAreas = new Map(usage.areas.map((area) => [area.id, area]));
  const expectedAreas = getExpectedAreas(usage, currentAreas, target);
  const expectedIds = new Set(expectedAreas.map((area) => area.id));
  const replacements = new Map<string, StorageAreaUsage>();

  for (const area of deletion.areas) {
    const currentArea = currentAreas.get(area.id);

    if (!currentArea) {
      throw new Error(`Storage deletion returned unknown area "${area.id}".`);
    }

    if (currentArea.category !== area.category) {
      throw new Error(`Storage deletion changed the category of area "${area.id}".`);
    }

    if (!expectedIds.has(area.id)) {
      throw new Error(
        `Storage deletion returned unexpected area "${area.id}" for ${describeTarget(target)}.`,
      );
    }

    if (replacements.has(area.id)) {
      throw new Error(`Storage deletion returned area "${area.id}" more than once.`);
    }

    replacements.set(area.id, area);
  }

  for (const area of expectedAreas) {
    if (!replacements.has(area.id)) {
      throw new Error(`Storage deletion omitted area "${area.id}" for ${describeTarget(target)}.`);
    }
  }

  return {
    areas: usage.areas.map((area) => replacements.get(area.id) ?? area),
  };
}
