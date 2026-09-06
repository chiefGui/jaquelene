import { Effect, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import type { ApiKeyVerificationResult } from "../api-key-configuration";

const balance = Schema.String.check(
  Schema.makeFilter((value) => value.trim() !== "" && Number.isFinite(Number(value))),
);
const balanceResponse = Schema.Struct({ usd_balance: balance, nano_balance: balance });

export const verifyNanoGptApiKey = Effect.fn("nanogpt.verifyApiKey")(
  function* (apiKey: string, client: HttpClient.HttpClient) {
    const response = yield* HttpClientRequest.post("https://nano-gpt.com/api/check-balance").pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.setHeader("X-API-Key", apiKey),
      HttpClient.withScope(client).execute,
    );
    if ([400, 401, 403].includes(response.status)) {
      return { state: "rejected" } as const;
    }
    if (response.status < 200 || response.status >= 300) {
      return { state: "unavailable" } as const;
    }
    yield* HttpClientResponse.schemaBodyJson(balanceResponse)(response);
    return { state: "configured" } as const;
  },
  Effect.timeout(10_000),
  Effect.catchTags({
    TimeoutError: () => Effect.succeed({ state: "unavailable" } as const),
    SchemaError: () => Effect.succeed({ state: "unavailable" } as const),
    HttpClientError: (error) => {
      if (error.reason._tag === "TransportError") {
        const cause = error.reason.cause;
        if (!(cause instanceof TypeError) && !(cause instanceof DOMException)) {
          return Effect.fail(cause);
        }
      }
      return Effect.succeed({ state: "unavailable" } as const);
    },
  }),
  Effect.scoped,
) satisfies (
  apiKey: string,
  client: HttpClient.HttpClient,
) => Effect.Effect<ApiKeyVerificationResult, unknown>;
