import { Context, Effect, Layer, Schema } from "effect";
import { app } from "electron";
import { join } from "node:path";
import { appUrl, handleAppScheme } from "../app-protocol";
import { DesktopConfigurationService } from "./configuration";

export class RendererInitializationError extends Schema.TaggedError<RendererInitializationError>()(
  "RendererInitializationError",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export type Renderer = Readonly<{
  url: string;
}>;

function waitForSignal<Result>(result: Promise<Result>, signal: AbortSignal) {
  if (signal.aborted) {
    result.catch(() => undefined);
    return Promise.reject(signal.reason);
  }

  let removeListener: (() => void) | undefined;
  const interruption = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    removeListener = () => signal.removeEventListener("abort", onAbort);
  });

  return Promise.race([result, interruption]).finally(removeListener);
}

export class RendererService extends Context.Service<RendererService, Renderer>()(
  "@jaquelene/desktop/application/Renderer",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const configuration = yield* DesktopConfigurationService;

      yield* Effect.tryPromise({
        try: (signal) => waitForSignal(app.whenReady(), signal),
        catch: (cause) =>
          new RendererInitializationError({
            message: "Electron did not become ready.",
            cause,
          }),
      });

      if (configuration.developmentServerUrl) {
        return RendererService.of({ url: configuration.developmentServerUrl });
      }

      yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            let webAppDirectory = join(app.getAppPath(), "../jaquelene-web/dist");

            if (app.isPackaged) {
              webAppDirectory = join(process.resourcesPath, "web");
            }

            return handleAppScheme(webAppDirectory);
          },
          catch: (cause) =>
            new RendererInitializationError({
              message: "Could not expose the packaged web application.",
              cause,
            }),
        }),
        (registration) => Effect.sync(() => registration[Symbol.dispose]()),
      );

      return RendererService.of({ url: appUrl });
    }),
  );
}
