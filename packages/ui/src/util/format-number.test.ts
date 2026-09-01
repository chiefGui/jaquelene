import { describe, expect, it } from "vite-plus/test";
import {
  formatCompactCount,
  formatCompactCurrencyNanos,
  formatCount,
  formatCurrencyNanos,
  formatUsd,
  formatUsdNanos,
} from "./format-number";

describe("formatCount", () => {
  it.each([
    [0, "0"],
    [-0, "0"],
    [1_083, "1,083"],
    [1_000_000, "1,000,000"],
  ])("formats %i as %s", (value, expected) => {
    expect(formatCount(value)).toBe(expected);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects the invalid count %s", (value) => {
    expect(() => formatCount(value)).toThrow(RangeError);
  });
});

describe("formatCompactCount", () => {
  it.each([
    [0, "0"],
    [1_083, "1.08K"],
    [1_000_000, "1M"],
  ])("formats %i as %s", (value, expected) => {
    expect(formatCompactCount(value)).toBe(expected);
  });
});

describe("formatUsd", () => {
  it.each([
    [0, "$0"],
    [-0, "$0"],
    [0.000_053, "$0.000053"],
    [1_234.56, "$1,234.56"],
  ])("formats %s USD as %s", (value, expected) => {
    expect(formatUsd(value)).toBe(expected);
  });

  it.each([-1, Number.POSITIVE_INFINITY, Number.NaN])("rejects the invalid amount %s", (value) => {
    expect(() => formatUsd(value)).toThrow(RangeError);
  });
});

describe("formatUsdNanos", () => {
  it.each([
    [0, "$0"],
    [53_000, "$0.000053"],
    [1_234_560_000_000, "$1,234.56"],
  ])("formats %i nanos as %s", (value, expected) => {
    expect(formatUsdNanos(value)).toBe(expected);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid nanos %s", (value) => {
    expect(() => formatUsdNanos(value)).toThrow(RangeError);
  });
});

describe("formatCurrencyNanos", () => {
  it("formats another canonical currency without converting it", () => {
    expect(formatCurrencyNanos(1_250_000_000, "EUR")).toBe("€1.25");
  });

  it.each(["usd", "US", "USDD"])('rejects the invalid currency "%s"', (currency) => {
    expect(() => formatCurrencyNanos(1, currency)).toThrow(RangeError);
  });
});

describe("formatCompactCurrencyNanos", () => {
  it.each([
    [0, "$0"],
    [53_000, "$0.000053"],
    [1_234_560_000_000, "$1.23K"],
    [1_000_000_000_000_000, "$1M"],
  ])("formats %i nanos as %s", (value, expected) => {
    expect(formatCompactCurrencyNanos(value, "USD")).toBe(expected);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid nanos %s", (value) => {
    expect(() => formatCompactCurrencyNanos(value, "USD")).toThrow(RangeError);
  });

  it("rejects a non-canonical currency", () => {
    expect(() => formatCompactCurrencyNanos(1, "usd")).toThrow(RangeError);
  });
});
