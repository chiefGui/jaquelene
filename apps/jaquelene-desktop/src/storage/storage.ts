import { opendir, stat } from "node:fs/promises";
import { join } from "node:path";

function isMissing(error: unknown) {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function measureDirectory(directoryPath: string): Promise<number> {
  const directory = await opendir(directoryPath);
  let totalBytes = 0;

  for await (const entry of directory) {
    const entryPath = join(directoryPath, entry.name);

    try {
      if (entry.isDirectory()) {
        totalBytes += await measureDirectory(entryPath);
      } else if (entry.isFile()) {
        totalBytes += (await stat(entryPath)).size;
      }
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
  }

  return totalBytes;
}

export function createStorage(userDataDirectory: string) {
  return {
    async measureUsage() {
      return { totalBytes: await measureDirectory(userDataDirectory) };
    },
  };
}

export type AppStorage = ReturnType<typeof createStorage>;
