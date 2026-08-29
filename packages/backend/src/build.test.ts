import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { getBackendBuildDirectories } from "./build";

describe("backend build directories", () => {
  it("places migrations where the bundled database resolves them", () => {
    const bundleDirectory = resolve(import.meta.dirname, "fixture-dist/main");

    const directories = getBackendBuildDirectories(bundleDirectory);

    expect(directories).toEqual([
      {
        sourceDirectory: resolve(import.meta.dirname, "migrations"),
        destinationDirectory: resolve(import.meta.dirname, "fixture-dist/migrations"),
      },
    ]);
    const migrations = directories[0];
    expect(migrations).toBeDefined();

    if (!migrations) {
      throw new Error("The backend migrations build directory is missing.");
    }

    expect(existsSync(migrations.sourceDirectory)).toBe(true);
  });

  it("rejects a bundle directory whose meaning depends on the process working directory", () => {
    expect(() => getBackendBuildDirectories("dist/main")).toThrow(
      "The backend bundle directory must be absolute.",
    );
  });

  it("rejects output that would overwrite source migrations", () => {
    const sourceDatabaseDirectory = resolve(import.meta.dirname, "database");

    expect(() => getBackendBuildDirectories(sourceDatabaseDirectory)).toThrow(
      "Backend build and source directories must not overlap.",
    );
  });
});
