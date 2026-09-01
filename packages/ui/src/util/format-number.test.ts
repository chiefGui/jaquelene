import { describe, expect, it } from "vite-plus/test";
import { formatCount, formatUsd } from "./format-number";

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
