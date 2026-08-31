import { StorageCategory, type StorageUsage } from "@jaquelene/ipc/renderer";
import { describe, expect, it } from "vite-plus/test";
import { reconcileStorageDeletion } from "./usage";

const usage = {
  areas: [
    { id: "content", category: StorageCategory.Content, bytes: 120 },
    { id: "preferences", category: StorageCategory.AppData, bytes: 40 },
    { id: "logs", category: StorageCategory.AppData, bytes: 80 },
  ],
} satisfies StorageUsage;

describe("storage deletion reconciliation", () => {
  it("replaces exactly the requested area without changing area order", () => {
    expect(
      reconcileStorageDeletion(
        usage,
        { areas: [{ id: "logs", category: StorageCategory.AppData, bytes: 3 }] },
        { kind: "area", id: "logs" },
      ),
    ).toEqual({
      areas: [
        usage.areas[0],
        usage.areas[1],
        { id: "logs", category: StorageCategory.AppData, bytes: 3 },
      ],
    });
  });

  it("replaces every area in the requested category", () => {
    expect(
      reconcileStorageDeletion(
        usage,
        {
          areas: [
            { id: "preferences", category: StorageCategory.AppData, bytes: 0 },
            { id: "logs", category: StorageCategory.AppData, bytes: 2 },
          ],
        },
        { kind: "category", id: StorageCategory.AppData },
      ),
    ).toEqual({
      areas: [
        usage.areas[0],
        { id: "preferences", category: StorageCategory.AppData, bytes: 0 },
        { id: "logs", category: StorageCategory.AppData, bytes: 2 },
      ],
    });
  });

  it("accepts an empty result for an empty category", () => {
    expect(
      reconcileStorageDeletion(
        { areas: [usage.areas[0]!] },
        { areas: [] },
        { kind: "category", id: StorageCategory.AppData },
      ),
    ).toEqual({ areas: [usage.areas[0]] });
  });

  it("rejects incomplete deletion results", () => {
    expect(() =>
      reconcileStorageDeletion(
        usage,
        { areas: [{ id: "logs", category: StorageCategory.AppData, bytes: 0 }] },
        { kind: "category", id: StorageCategory.AppData },
      ),
    ).toThrow('omitted area "preferences"');
  });

  it("rejects areas outside the requested target", () => {
    expect(() =>
      reconcileStorageDeletion(
        usage,
        { areas: [{ id: "preferences", category: StorageCategory.AppData, bytes: 0 }] },
        { kind: "area", id: "logs" },
      ),
    ).toThrow('unexpected area "preferences"');
  });

  it("rejects duplicate areas", () => {
    expect(() =>
      reconcileStorageDeletion(
        usage,
        {
          areas: [
            { id: "logs", category: StorageCategory.AppData, bytes: 0 },
            { id: "logs", category: StorageCategory.AppData, bytes: 0 },
          ],
        },
        { kind: "area", id: "logs" },
      ),
    ).toThrow('area "logs" more than once');
  });

  it("rejects unknown areas", () => {
    expect(() =>
      reconcileStorageDeletion(
        usage,
        { areas: [{ id: "unknown", category: StorageCategory.AppData, bytes: 0 }] },
        { kind: "area", id: "logs" },
      ),
    ).toThrow('unknown area "unknown"');
  });

  it("rejects recategorized areas", () => {
    expect(() =>
      reconcileStorageDeletion(
        usage,
        { areas: [{ id: "logs", category: StorageCategory.Content, bytes: 0 }] },
        { kind: "area", id: "logs" },
      ),
    ).toThrow('changed the category of area "logs"');
  });

  it("rejects requests for areas absent from the measured usage", () => {
    expect(() =>
      reconcileStorageDeletion(usage, { areas: [] }, { kind: "area", id: "unknown" }),
    ).toThrow('Cannot delete unknown storage area "unknown"');
  });
});
