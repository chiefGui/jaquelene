import { Effect, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

const decodeKey = HttpClientResponse.schemaBodyJson(
  Schema.Struct({
    data: Schema.Struct({ label: Schema.NonEmptyString }),
  }),
);

export const verifyOpenRouterApiKey = Effect.fn("OpenRouter.verifyApiKey")(
  function* (apiKey: string, client: HttpClient.HttpClient) {
    const response = yield* HttpClientRequest.get("https://openrouter.ai/api/v1/key").pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.bearerToken(apiKey),
      HttpClient.withScope(client).execute,
    );

    if (response.status === 401 || response.status === 403) {
      return { state: "rejected" as const };
    }

    if (response.status < 200 || response.status >= 300) {
      return { state: "unavailable" as const };
    }

    const body = yield* decodeKey(response);
    return { state: "configured" as const, keyLabel: body.data.label };
  },
  Effect.scoped,
  Effect.timeout(10_000),
  Effect.catchTags({
    TimeoutError: () => Effect.succeed({ state: "unavailable" as const }),
    SchemaError: () => Effect.succeed({ state: "unavailable" as const }),
    HttpClientError: (error) => {
      const reason = error.reason;

      if (
        reason._tag === "TransportError" &&
        !(reason.cause instanceof TypeError) &&
        !(reason.cause instanceof DOMException)
      ) {
        return Effect.fail(reason.cause);
      }

      return Effect.succeed({ state: "unavailable" as const });
    },
  }),
);
