import { Effect } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";

export function httpClient(request: typeof fetch) {
  return Effect.runSync(
    HttpClient.HttpClient.pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, request),
      Effect.provideService(HttpClient.TracerPropagationEnabled, false),
    ),
  );
}

export function stalledResponse(signal: AbortSignal, onRead: () => void): Response {
  return new Response(
    new ReadableStream<Uint8Array>(
      {
        start(controller) {
          signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
        },
        pull: onRead,
      },
      { highWaterMark: 0 },
    ),
  );
}
