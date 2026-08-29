import type { ProviderConfigureResult } from "@jaquelene/backend";

const currentKeyEndpoint = "https://openrouter.ai/api/v1/key";

export async function verifyOpenRouterApiKey(
  apiKey: string,
  signal: AbortSignal,
): Promise<ProviderConfigureResult> {
  let response: Response;

  try {
    response = await fetch(currentKeyEndpoint, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    });
  } catch (cause) {
    signal.throwIfAborted();

    if (cause instanceof TypeError || cause instanceof DOMException) {
      return { state: "unavailable" };
    }

    throw cause;
  }

  if (response.status === 401 || response.status === 403) {
    return { state: "rejected" };
  }

  if (!response.ok) {
    return { state: "unavailable" };
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      return { state: "unavailable" };
    }

    throw cause;
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("data" in body) ||
    typeof body.data !== "object" ||
    body.data === null ||
    !("label" in body.data) ||
    typeof body.data.label !== "string" ||
    !body.data.label
  ) {
    return { state: "unavailable" };
  }

  return { state: "configured", keyLabel: body.data.label };
}
