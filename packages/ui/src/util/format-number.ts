const countFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usdFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumSignificantDigits: 6,
  style: "currency",
});

function normalizeNegativeZero(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

export function formatCount(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Count must be a non-negative safe integer.");
  }

  return countFormatter.format(normalizeNegativeZero(value));
}

export function formatUsd(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("USD amount must be finite and non-negative.");
  }

  return usdFormatter.format(normalizeNegativeZero(value));
}
