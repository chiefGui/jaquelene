import { ErrorSeverity, ErrorSource, parseErrorReport } from "@jaquelene/diagnostics";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createApplicationDiagnostics } from "./diagnostics";

const directories: string[] = [];

function createDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-diagnostics-"));
  directories.push(directory);
  return join(directory, "diagnostics");
}

function openDiagnostics(
  directoryPath: string,
  openPath: (path: string) => Promise<void> = vi.fn(async () => undefined),
  shouldWriteToDisk: () => boolean = () => true,
) {
  return createApplicationDiagnostics({ directoryPath, openPath, shouldWriteToDisk });
}

afterEach(() => {
  vi.restoreAllMocks();

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("application diagnostics", () => {
  it("persists main and renderer reports in order", async () => {
    const directory = createDirectory();
    const diagnostics = openDiagnostics(
      directory,
      vi.fn(async () => undefined),
    );

    diagnostics.report({
      severity: ErrorSeverity.Fatal,
      operation: "application.start",
      error: new Error("Startup failed"),
    });
    diagnostics.recordRendererReport({
      id: "renderer-report",
      occurredAt: 1_725_000_000_001,
      source: ErrorSource.Renderer,
      severity: ErrorSeverity.Error,
      operation: "storage.measure",
      error: { name: "Error", message: "Measurement failed" },
    });
    await diagnostics.close();

    const reports = readFileSync(join(directory, "reports.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(parseErrorReport);
    expect(reports).toMatchObject([
      {
        id: expect.any(String),
        occurredAt: expect.any(Number),
        source: ErrorSource.Main,
        severity: ErrorSeverity.Fatal,
        operation: "application.start",
        error: { message: "Startup failed" },
      },
      {
        id: "renderer-report",
        occurredAt: 1_725_000_000_001,
        source: ErrorSource.Renderer,
        severity: ErrorSeverity.Error,
        operation: "storage.measure",
        error: { message: "Measurement failed" },
      },
    ]);
  });

  it("rejects a main-process report at the renderer boundary", async () => {
    const diagnostics = openDiagnostics(
      createDirectory(),
      vi.fn(async () => undefined),
    );

    expect(() =>
      diagnostics.recordRendererReport({
        id: "report-1",
        occurredAt: 1_725_000_000_000,
        source: ErrorSource.Main,
        severity: ErrorSeverity.Error,
        operation: "storage.measure",
        error: { name: "Error", message: "Measurement failed" },
      }),
    ).toThrow("must identify the renderer");
    await diagnostics.close();
  });

  it("keeps only the current and previous bounded files", async () => {
    const directory = createDirectory();
    const diagnostics = openDiagnostics(
      directory,
      vi.fn(async () => undefined),
    );

    for (let index = 0; index < 80; index += 1) {
      const error = new Error("x".repeat(16_384));
      error.stack = "y".repeat(16_384);
      diagnostics.report({
        severity: ErrorSeverity.Error,
        operation: "diagnostics.rotate",
        error,
      });
    }

    await diagnostics.close();

    expect(readdirSync(directory).sort()).toEqual(["reports.jsonl", "reports.previous.jsonl"]);
    expect(existsSync(join(directory, "reports.jsonl"))).toBe(true);
    expect(existsSync(join(directory, "reports.previous.jsonl"))).toBe(true);
    expect(readFileSync(join(directory, "reports.jsonl")).byteLength).toBeLessThanOrEqual(
      1_048_576,
    );
    expect(readFileSync(join(directory, "reports.previous.jsonl")).byteLength).toBeLessThanOrEqual(
      1_048_576,
    );
  });

  it("serializes deletion with pending reports", async () => {
    const directory = createDirectory();
    const diagnostics = openDiagnostics(
      directory,
      vi.fn(async () => undefined),
    );

    diagnostics.report({
      severity: ErrorSeverity.Warning,
      operation: "local-state.recover",
      error: new Error("Invalid state"),
    });
    await diagnostics.deleteAll();
    await diagnostics.close();

    expect(existsSync(directory)).toBe(false);
  });

  it("accepts new reports after deletion", async () => {
    const directory = createDirectory();
    const diagnostics = openDiagnostics(
      directory,
      vi.fn(async () => undefined),
    );

    diagnostics.report({
      severity: ErrorSeverity.Warning,
      operation: "diagnostics.before-delete",
      error: new Error("Old failure"),
    });
    await diagnostics.deleteAll();
    diagnostics.report({
      severity: ErrorSeverity.Error,
      operation: "diagnostics.after-delete",
      error: new Error("New failure"),
    });
    await diagnostics.close();

    const reports = readFileSync(join(directory, "reports.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(parseErrorReport);
    expect(reports).toMatchObject([
      {
        operation: "diagnostics.after-delete",
        error: { message: "New failure" },
      },
    ]);
  });

  it("applies the current disk-writing preference when each report is accepted", async () => {
    const directory = createDirectory();
    let writeToDisk = true;
    const diagnostics = openDiagnostics(
      directory,
      vi.fn(async () => undefined),
      () => writeToDisk,
    );

    diagnostics.report({
      severity: ErrorSeverity.Warning,
      operation: "diagnostics.before-disable",
      error: new Error("Persisted before disabling"),
    });
    writeToDisk = false;
    diagnostics.report({
      severity: ErrorSeverity.Error,
      operation: "diagnostics.while-disabled",
      error: new Error("Not persisted"),
    });
    diagnostics.recordRendererReport({
      id: "renderer-while-disabled",
      occurredAt: 1_725_000_000_002,
      source: ErrorSource.Renderer,
      severity: ErrorSeverity.Error,
      operation: "diagnostics.renderer-while-disabled",
      error: { name: "Error", message: "Not persisted" },
    });
    writeToDisk = true;
    diagnostics.report({
      severity: ErrorSeverity.Error,
      operation: "diagnostics.after-enable",
      error: new Error("Persisted after enabling"),
    });
    await diagnostics.close();

    const reports = readFileSync(join(directory, "reports.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(parseErrorReport);
    expect(reports.map(({ operation }) => operation)).toEqual([
      "diagnostics.before-disable",
      "diagnostics.after-enable",
    ]);
  });

  it("does not create diagnostics storage while disk writing is disabled", async () => {
    const directory = createDirectory();
    const diagnostics = openDiagnostics(
      directory,
      vi.fn(async () => undefined),
      () => false,
    );

    diagnostics.report({
      severity: ErrorSeverity.Error,
      operation: "diagnostics.disabled",
      error: new Error("Not persisted"),
    });
    await diagnostics.close();

    expect(existsSync(directory)).toBe(false);
  });

  it("falls back to the console when the persistence preference cannot be read", async () => {
    const fallback = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("Could not inspect diagnostics preferences.");
    const diagnostics = openDiagnostics(
      createDirectory(),
      vi.fn(async () => undefined),
      () => {
        throw failure;
      },
    );

    diagnostics.report({
      severity: ErrorSeverity.Error,
      operation: "diagnostics.preference",
      error: new Error("Report"),
    });
    await diagnostics.close();

    expect(fallback).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledWith(
      "Could not persist a diagnostic report.",
      failure,
      expect.objectContaining({ operation: "diagnostics.preference" }),
    );
  });

  it("creates and opens its inspection directory", async () => {
    const directory = createDirectory();
    const openPath = vi.fn(async () => undefined);
    const diagnostics = openDiagnostics(directory, openPath, () => false);

    await diagnostics.openDirectory();
    await diagnostics.close();

    expect(openPath).toHaveBeenCalledWith(directory);
    expect(existsSync(directory)).toBe(true);
  });

  it("propagates a failure to open its inspection directory", async () => {
    const failure = new Error("Could not open path.");
    const diagnostics = openDiagnostics(createDirectory(), async () => {
      throw failure;
    });

    await expect(diagnostics.openDirectory()).rejects.toBe(failure);
    await diagnostics.close();
  });

  it("coalesces repeated persistence failures", async () => {
    const fallback = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const diagnostics = openDiagnostics(
      `${createDirectory()}\0`,
      vi.fn(async () => undefined),
    );

    for (let index = 0; index < 2; index += 1) {
      diagnostics.report({
        severity: ErrorSeverity.Error,
        operation: "diagnostics.write",
        error: new Error(`Failure ${index}`),
      });
    }
    await diagnostics.close();

    expect(fallback).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledWith(
      "Could not persist a diagnostic report.",
      expect.any(Error),
      expect.objectContaining({ operation: "diagnostics.write" }),
    );
  });

  it("reports queue saturation once per saturated period", async () => {
    const fallback = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const diagnostics = openDiagnostics(
      createDirectory(),
      vi.fn(async () => undefined),
    );

    for (let index = 0; index < 200; index += 1) {
      diagnostics.report({
        severity: ErrorSeverity.Error,
        operation: "diagnostics.write",
        error: new Error(`Failure ${index}`),
      });
    }
    await diagnostics.close();

    expect(fallback).toHaveBeenCalledOnce();
    expect(fallback.mock.calls[0]?.[1]).toMatchObject({
      message: "The diagnostic report queue is full.",
    });
  });

  it("waits for inspection to finish before closing", async () => {
    let releaseInspection!: () => void;
    let reportInspectionStarted!: () => void;
    const inspectionCanFinish = new Promise<void>((resolve) => {
      releaseInspection = resolve;
    });
    const inspectionStarted = new Promise<void>((resolve) => {
      reportInspectionStarted = resolve;
    });
    const diagnostics = openDiagnostics(createDirectory(), async () => {
      reportInspectionStarted();
      await inspectionCanFinish;
    });

    const opening = diagnostics.openDirectory();
    await inspectionStarted;
    let closed = false;
    const closing = diagnostics.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);

    releaseInspection();
    await Promise.all([opening, closing]);
    expect(closed).toBe(true);
  });
});
