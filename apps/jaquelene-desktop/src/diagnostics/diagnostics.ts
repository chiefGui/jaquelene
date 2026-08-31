import {
  createErrorReport,
  ErrorSource,
  serializeErrorReport,
  type ErrorReport,
  type ErrorReporter,
} from "@jaquelene/diagnostics";
import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { PathOpener } from "../path-opener";

const maximumFileBytes = 1_048_576;
const maximumPendingReports = 128;
const currentFileName = "reports.jsonl";
const previousFileName = "reports.previous.jsonl";

type ReportInput = Parameters<ErrorReporter["report"]>[0];

export type ApplicationDiagnostics = ErrorReporter &
  Readonly<{
    recordRendererReport: (report: ErrorReport) => void;
    deleteAll: () => Promise<void>;
    openDirectory: () => Promise<void>;
    inspect: () => Readonly<{ state: "open" | "closing" | "closed" }>;
    close: () => Promise<void>;
    [Symbol.asyncDispose]: () => Promise<void>;
  }>;

function isMissing(error: unknown) {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function getFileSize(path: string) {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (isMissing(error)) {
      return 0;
    }

    throw error;
  }
}

export function getDiagnosticsStoragePath(userDataDirectory: string) {
  return join(userDataDirectory, "diagnostics");
}

export function createApplicationDiagnostics({
  directoryPath,
  openPath,
  shouldWriteToDisk,
}: Readonly<{
  directoryPath: string;
  openPath: PathOpener;
  shouldWriteToDisk: () => boolean;
}>): ApplicationDiagnostics {
  const currentFilePath = join(directoryPath, currentFileName);
  const previousFilePath = join(directoryPath, previousFileName);
  let acceptingReports = true;
  let pendingReportCount = 0;
  let queueCapacityReported = false;
  let persistenceFailureReported = false;
  let queue = Promise.resolve();
  let state: "open" | "closing" | "closed" = "open";
  let closePromise: Promise<void> | undefined;

  function notifyFallback(report: ErrorReport, failure: unknown) {
    try {
      console.error("Could not persist a diagnostic report.", failure, report);
    } catch {
      // The process console is the final reporting boundary.
    }
  }

  function enqueue<Result>(operation: () => Promise<Result>) {
    const result = queue.then(operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function appendLine(line: string) {
    const lineBytes = Buffer.byteLength(line);
    await mkdir(directoryPath, { recursive: true });
    const currentFileBytes = await getFileSize(currentFilePath);

    if (currentFileBytes > 0 && currentFileBytes + lineBytes > maximumFileBytes) {
      await rm(previousFilePath, { force: true });
      await rename(currentFilePath, previousFilePath);
    }

    await appendFile(currentFilePath, line, "utf8");
  }

  function persist(report: ErrorReport) {
    if (!acceptingReports) {
      notifyFallback(report, new Error("Diagnostics are closed."));
      return;
    }

    try {
      if (!shouldWriteToDisk()) {
        return;
      }
    } catch (failure) {
      notifyFallback(report, failure);
      return;
    }

    if (pendingReportCount >= maximumPendingReports) {
      if (!queueCapacityReported) {
        queueCapacityReported = true;
        notifyFallback(report, new Error("The diagnostic report queue is full."));
      }

      return;
    }

    let line: string;

    try {
      line = `${serializeErrorReport(report)}\n`;
    } catch (failure) {
      notifyFallback(report, failure);
      return;
    }

    pendingReportCount += 1;
    void enqueue(async () => {
      try {
        await appendLine(line);
        persistenceFailureReported = false;
      } catch (failure) {
        if (!persistenceFailureReported) {
          persistenceFailureReported = true;
          notifyFallback(report, failure);
        }
      } finally {
        pendingReportCount -= 1;
        queueCapacityReported = false;
      }
    });
  }

  function requireOpen() {
    if (!acceptingReports) {
      throw new Error("Diagnostics are closed.");
    }
  }

  function close() {
    if (!closePromise) {
      acceptingReports = false;
      state = "closing";
      closePromise = queue.finally(() => {
        state = "closed";
      });
    }

    return closePromise;
  }

  return {
    report(input: ReportInput) {
      persist(
        createErrorReport(
          { ...input, source: ErrorSource.Main },
          { id: randomUUID(), occurredAt: Date.now() },
        ),
      );
    },
    recordRendererReport(report) {
      if (report.source !== ErrorSource.Renderer) {
        throw new TypeError(
          "A renderer diagnostic report must identify the renderer as its source.",
        );
      }

      persist(report);
    },
    deleteAll() {
      requireOpen();
      return enqueue(() => rm(directoryPath, { recursive: true, force: true }));
    },
    openDirectory() {
      requireOpen();
      return enqueue(async () => {
        await mkdir(directoryPath, { recursive: true });
        await openPath(directoryPath);
      });
    },
    inspect() {
      return { state };
    },
    close,
    [Symbol.asyncDispose]: close,
  };
}
