import { lstat, opendir } from "node:fs/promises";
import { join } from "node:path";

const maximumByteCount = BigInt(Number.MAX_SAFE_INTEGER);

export type StorageManifest = Readonly<{
  userContent: readonly string[];
  applicationData: readonly string[];
}>;

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

export function createStorage({ userContent, applicationData }: StorageManifest) {
  return {
    async measureUsage() {
      const [userContentBytes, applicationDataBytes] = await Promise.all([
        measurePaths(userContent),
        measurePaths(applicationData),
      ]);

      assertSupportedByteCount(userContentBytes + applicationDataBytes);

      return {
        userContentBytes: Number(userContentBytes),
        applicationDataBytes: Number(applicationDataBytes),
      };
    },
  };
}

export type AppStorage = ReturnType<typeof createStorage>;
