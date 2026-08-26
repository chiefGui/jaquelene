import { describe, expect, it } from "vite-plus/test";
import { formatBytes } from "./format-bytes";

describe("formatBytes", () => {
  it.each([
    [0, "0 bytes"],
    [1, "1 byte"],
    [842, "842 bytes"],
    [1_500, "1.5 KB"],
    [12_450_000, "12.5 MB"],
    [1_000_000_000, "1 GB"],
    [999_999, "1 MB"],
  ])("formats %i bytes as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it.each([-1, 1.5, Number.POSITIVE_INFINITY])("rejects the invalid byte count %s", (bytes) => {
    expect(() => formatBytes(bytes)).toThrow(RangeError);
  });
});
