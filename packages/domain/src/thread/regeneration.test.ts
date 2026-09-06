import { describe, expect, it } from "vite-plus/test";
import {
  parseRegenerationInstructions,
  REGENERATION_INSTRUCTIONS_MAX_LENGTH,
} from "./regeneration";

describe("regeneration instructions", () => {
  it.each([undefined, "", " \t\n\u2003 "])("treats %j as no guidance", (value) => {
    expect(parseRegenerationInstructions(value)).toBeUndefined();
  });

  it("trims the edges while preserving multiline guidance", () => {
    expect(parseRegenerationInstructions("  Shorter.\n\nKeep the ending.  ")).toBe(
      "Shorter.\n\nKeep the ending.",
    );
  });

  it("enforces the same UTF-16 bound for ASCII and supplementary characters", () => {
    expect(
      parseRegenerationInstructions("a".repeat(REGENERATION_INSTRUCTIONS_MAX_LENGTH)),
    ).toHaveLength(4_000);
    expect(parseRegenerationInstructions("😀".repeat(2_000))).toHaveLength(4_000);
    expect(() => parseRegenerationInstructions("a".repeat(4_001))).toThrow("at most 4,000");
    expect(() => parseRegenerationInstructions("😀".repeat(2_001))).toThrow("at most 4,000");
    expect(() => parseRegenerationInstructions(null)).toThrow("at most 4,000");
  });
});
