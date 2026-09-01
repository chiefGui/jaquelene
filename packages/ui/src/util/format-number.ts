const countFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compactCountFormatter = new Intl.NumberFormat("en-US", {
  compactDisplay: "short",
  maximumSignificantDigits: 3,
  notation: "compact",
});
const currencyFormatters = new Map<string, Intl.NumberFormat>();

function normalizeNegativeZero(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

export function formatCount(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Count must be a non-negative safe integer.");
  }

  return countFormatter.format(normalizeNegativeZero(value));
}

export function formatCompactCount(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Count must be a non-negative safe integer.");
  }

  return compactCountFormatter.format(normalizeNegativeZero(value));
}

export function formatCurrency(value: number, currency: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("Currency amount must be finite and non-negative.");
  }

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new RangeError("Currency must be an uppercase three-letter code.");
  }

  let formatter = currencyFormatters.get(currency);

  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      currency,
      maximumSignificantDigits: 6,
      style: "currency",
    });
    currencyFormatters.set(currency, formatter);
  }

  return formatter.format(normalizeNegativeZero(value));
}

export function formatUsd(value: number) {
  return formatCurrency(value, "USD");
}

export function formatCurrencyNanos(amountNanos: number, currency: string) {
  if (!Number.isSafeInteger(amountNanos) || amountNanos < 0) {
    throw new RangeError("Currency nanos must be a non-negative safe integer.");
  }

  return formatCurrency(amountNanos / 1_000_000_000, currency);
}

export function formatUsdNanos(amountNanos: number) {
  return formatCurrencyNanos(amountNanos, "USD");
}
