const tokenPriceFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumSignificantDigits: 6,
  style: "currency",
});

export function formatTokenPrice(usdPerMillion: number) {
  if (!Number.isFinite(usdPerMillion) || usdPerMillion < 0) {
    throw new RangeError("Token price must be finite and non-negative.");
  }

  return `${tokenPriceFormatter.format(usdPerMillion)}/M`;
}
