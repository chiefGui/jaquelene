import { Schema, type Effect } from "effect";

export const StorageCategory = {
  Content: "content",
  Cache: "cache",
  AppData: "app-data",
} as const;

export type StorageCategory = (typeof StorageCategory)[keyof typeof StorageCategory];
export type StorageAreaId = string;

export type StorageArea<Requirements = never> = Readonly<{
  id: StorageAreaId;
  category: StorageCategory;
  paths: readonly string[];
  delete: Effect.Effect<void, StorageAreaDeleteError, Requirements>;
}>;

export class StorageAreaDeleteError extends Schema.TaggedError<StorageAreaDeleteError>()(
  "StorageAreaDeleteError",
  { areaId: Schema.String, cause: Schema.Defect() },
) {
  override get message() {
    return `Could not delete storage area "${this.areaId}".`;
  }
}
