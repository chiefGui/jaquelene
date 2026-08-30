import { Exit } from "effect";
import type { App } from "electron";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ApplicationDiagnostics } from "../diagnostics/diagnostics";
import type { DesktopApplication } from "./desktop-application";
import { createDesktopHost } from "./host";

function applicationHarness() {
  const events = new EventEmitter();
  const quit = vi.fn();
  const releaseSingleInstanceLock = vi.fn();
  const application = {
    on: events.on.bind(events),
    once: events.once.bind(events),
    off: events.off.bind(events),
    quit,
    releaseSingleInstanceLock,
  } as unknown as App;

  return { application, events, quit, releaseSingleInstanceLock };
}

function diagnosticsHarness(order: string[] = []) {
  const report = vi.fn(() => order.push("report"));
  const close = vi.fn(async () => {
    order.push("diagnostics.close");
  });
  const diagnostics = {
    report,
    recordRendererReport() {},
    deleteAll: async () => undefined,
    openDirectory: async () => undefined,
    inspect: () => ({ state: "open" as const }),
    close,
    [Symbol.asyncDispose]: close,
  } satisfies ApplicationDiagnostics;

  return { diagnostics, report, close };
}

function desktopHarness() {
  const ready = Promise.withResolvers<void>();
  const result = Promise.withResolvers<Exit.Exit<void, Error>>();
  const stop = vi.fn(async () => Exit.void as Exit.Exit<void, Error>);
  const show = vi.fn(async () => undefined);
  const desktop = {
    ready: ready.promise,
    result: result.promise,
    show,
    stop,
    inspect: () => ({ state: "running" as const }),
  } satisfies DesktopApplication;

  return { desktop, ready, result, stop, show };
}

describe("desktop host", () => {
  it("keeps diagnostics and the instance lease until owned shutdown completes", async () => {
    const order: string[] = [];
    const appHarness = applicationHarness();
    const diagnosticHarness = diagnosticsHarness(order);
    const desktop = desktopHarness();
    desktop.stop.mockImplementation(async () => {
      order.push("application.stop");
      return Exit.void as Exit.Exit<void, Error>;
    });
    createDesktopHost({
      application: appHarness.application,
      diagnostics: diagnosticHarness.diagnostics,
      launch: () => desktop.desktop,
      shutdownTimeout: 1_000,
    });
    desktop.ready.resolve();
    await desktop.ready.promise;
    const quitEvent = { preventDefault: vi.fn() };

    appHarness.events.emit("will-quit", quitEvent);
    await vi.waitFor(() => expect(appHarness.quit).toHaveBeenCalledOnce());

    expect(quitEvent.preventDefault).toHaveBeenCalledOnce();
    expect(order).toEqual(["application.stop", "diagnostics.close"]);
    expect(appHarness.releaseSingleInstanceLock).not.toHaveBeenCalled();

    appHarness.events.emit("quit");
    expect(appHarness.releaseSingleInstanceLock).toHaveBeenCalledOnce();
  });

  it("reports a synchronous startup failure before closing diagnostics", async () => {
    const order: string[] = [];
    const startupFailure = new Error("Configuration failed.");
    const appHarness = applicationHarness();
    const diagnosticHarness = diagnosticsHarness(order);
    createDesktopHost({
      application: appHarness.application,
      diagnostics: diagnosticHarness.diagnostics,
      launch: () => {
        throw startupFailure;
      },
      shutdownTimeout: 1_000,
    });

    await vi.waitFor(() => expect(appHarness.quit).toHaveBeenCalledOnce());

    expect(order).toEqual(["report", "diagnostics.close"]);
    expect(diagnosticHarness.report).toHaveBeenCalledWith({
      severity: "fatal",
      operation: "application.start",
      error: startupFailure,
    });
    appHarness.events.emit("quit");
  });

  it("coalesces show requests received while the application is starting", async () => {
    const appHarness = applicationHarness();
    const diagnosticHarness = diagnosticsHarness();
    const desktop = desktopHarness();
    createDesktopHost({
      application: appHarness.application,
      diagnostics: diagnosticHarness.diagnostics,
      launch: () => desktop.desktop,
      shutdownTimeout: 1_000,
    });

    appHarness.events.emit("activate");
    appHarness.events.emit("second-instance");
    desktop.ready.resolve();
    await vi.waitFor(() => expect(desktop.show).toHaveBeenCalledOnce());

    appHarness.events.emit("will-quit", { preventDefault: vi.fn() });
    await vi.waitFor(() => expect(appHarness.quit).toHaveBeenCalledOnce());
    appHarness.events.emit("quit");
  });
});
