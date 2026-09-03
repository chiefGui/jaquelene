import { describe, expect, it } from "vite-plus/test";
import { formatContextWindowTokens } from "./format-context-window";

describe("formatContextWindowTokens", () => {
  it.each([
    [32_768, "32.8K"],
    [128_000, "128K"],
    [1_048_576, "1M"],
    [1_500_000, "1.5M"],
  ])("formats %i tokens as %s", (tokens, expected) => {
    expect(formatContextWindowTokens(tokens)).toBe(expected);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects the invalid context window %s",
    (tokens) => {
      expect(() => formatContextWindowTokens(tokens)).toThrow(RangeError);
    },
  );
});
