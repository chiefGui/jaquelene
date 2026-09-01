import { formatUsd } from "@jaquelene/ui";

export function formatTokenPrice(usdPerMillion: number) {
  if (!Number.isFinite(usdPerMillion) || usdPerMillion < 0) {
    throw new RangeError("Token price must be finite and non-negative.");
  }

  return `${formatUsd(usdPerMillion)}/M`;
}
