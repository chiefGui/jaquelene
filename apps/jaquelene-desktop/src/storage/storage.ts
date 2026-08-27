import { lstat, opendir } from "node:fs/promises";
import { join } from "node:path";

function isMissing(error: unknown) {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function measurePath(path: string): Promise<number> {
  try {
    const entry = await lstat(path);

    if (entry.isFile()) {
      return entry.size;
    }

    if (!entry.isDirectory()) {
      return 0;
    }

    const directory = await opendir(path);
    let totalBytes = 0;

    for await (const child of directory) {
      totalBytes += await measurePath(join(path, child.name));
    }

    return totalBytes;
  } catch (error) {
    if (isMissing(error)) {
      return 0;
    }

    throw error;
  }
}

export function createStorage(ownedPaths: readonly string[]) {
  return {
    async measureUsage() {
      let totalBytes = 0;

      for (const path of ownedPaths) {
        totalBytes += await measurePath(path);
      }

      return { totalBytes };
    },
  };
}

export type AppStorage = ReturnType<typeof createStorage>;
