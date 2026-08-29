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

afterEach(() => {
  vi.restoreAllMocks();

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("application diagnostics", () => {
  it("persists main and renderer reports in order", async () => {
    const directory = createDirectory();
    const diagnostics = createApplicationDiagnostics(
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
    const diagnostics = createApplicationDiagnostics(
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
    const diagnostics = createApplicationDiagnostics(
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
    const diagnostics = createApplicationDiagnostics(
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
    const diagnostics = createApplicationDiagnostics(
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

  it("creates and opens its inspection directory", async () => {
    const directory = createDirectory();
    const openPath = vi.fn(async () => undefined);
    const diagnostics = createApplicationDiagnostics(directory, openPath);

    await diagnostics.openDirectory();
    await diagnostics.close();

    expect(openPath).toHaveBeenCalledWith(directory);
    expect(existsSync(directory)).toBe(true);
  });

  it("propagates a failure to open its inspection directory", async () => {
    const failure = new Error("Could not open path.");
    const diagnostics = createApplicationDiagnostics(createDirectory(), async () => {
      throw failure;
    });

    await expect(diagnostics.openDirectory()).rejects.toBe(failure);
    await diagnostics.close();
  });

  it("coalesces repeated persistence failures", async () => {
    const fallback = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const diagnostics = createApplicationDiagnostics(
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
    const diagnostics = createApplicationDiagnostics(
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
    const diagnostics = createApplicationDiagnostics(createDirectory(), async () => {
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
