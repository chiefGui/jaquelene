const countFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compactCountFormatter = new Intl.NumberFormat("en-US", {
  compactDisplay: "short",
  maximumSignificantDigits: 3,
  notation: "compact",
});
const currencyFormatters = new Map<string, Intl.NumberFormat>();
const compactCurrencyFormatters = new Map<string, Intl.NumberFormat>();

function normalizeNegativeZero(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

function requireCurrencyAmount(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("Currency amount must be finite and non-negative.");
  }

  return normalizeNegativeZero(value);
}

function requireCurrency(currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new RangeError("Currency must be an uppercase three-letter code.");
  }
}

function currencyNanosToAmount(amountNanos: number) {
  if (!Number.isSafeInteger(amountNanos) || amountNanos < 0) {
    throw new RangeError("Currency nanos must be a non-negative safe integer.");
  }

  return amountNanos / 1_000_000_000;
}

export function formatCount(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Count must be a non-negative safe integer.");
  }

  return countFormatter.format(normalizeNegativeZero(value));
}

export function formatPluralizedCount(value: number, singular: string, plural: string) {
  return `${formatCount(value)} ${value === 1 ? singular : plural}`;
}

export function formatCompactCount(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Count must be a non-negative safe integer.");
  }

  return compactCountFormatter.format(normalizeNegativeZero(value));
}

export function formatCurrency(value: number, currency: string) {
  const amount = requireCurrencyAmount(value);
  requireCurrency(currency);

  let formatter = currencyFormatters.get(currency);

  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      currency,
      maximumSignificantDigits: 6,
      style: "currency",
    });
    currencyFormatters.set(currency, formatter);
  }

  return formatter.format(amount);
}

export function formatCompactCurrency(value: number, currency: string) {
  const amount = requireCurrencyAmount(value);
  requireCurrency(currency);

  let formatter = compactCurrencyFormatters.get(currency);

  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      currency,
      compactDisplay: "short",
      maximumSignificantDigits: 3,
      notation: "compact",
      style: "currency",
    });
    compactCurrencyFormatters.set(currency, formatter);
  }

  return formatter.format(amount);
}

export function formatUsd(value: number) {
  return formatCurrency(value, "USD");
}

export function formatCurrencyNanos(amountNanos: number, currency: string) {
  return formatCurrency(currencyNanosToAmount(amountNanos), currency);
}

export function formatCompactCurrencyNanos(amountNanos: number, currency: string) {
  return formatCompactCurrency(currencyNanosToAmount(amountNanos), currency);
}

export function formatUsdNanos(amountNanos: number) {
  return formatCurrencyNanos(amountNanos, "USD");
}
