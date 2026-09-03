import type { ProviderConfigureResult } from "@jaquelene/backend";

const balanceEndpoint = "https://nano-gpt.com/api/check-balance";

function isBalance(value: unknown) {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value));
}

export async function verifyNanoGptApiKey(
  apiKey: string,
  signal: AbortSignal,
): Promise<ProviderConfigureResult> {
  let response: Response;

  try {
    response = await fetch(balanceEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
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

  if ([400, 401, 403].includes(response.status)) {
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
    !("usd_balance" in body) ||
    !isBalance(body.usd_balance) ||
    !("nano_balance" in body) ||
    !isBalance(body.nano_balance)
  ) {
    return { state: "unavailable" };
  }

  return { state: "configured" };
}
