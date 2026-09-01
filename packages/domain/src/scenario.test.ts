import { describe, expect, it } from "vite-plus/test";
import {
  InvalidScenarioTitleError,
  SCENARIO_TITLE_MAX_LENGTH,
  createScenarioInputSchema,
  parseCreateScenarioInput,
  parseScenarioTitle,
} from "./scenario";

describe("scenario title", () => {
  it("normalizes surrounding whitespace", () => {
    expect(parseScenarioTitle("  First scenario  ")).toBe("First scenario");
  });

  it("allows the maximum number of Unicode characters", () => {
    expect(parseScenarioTitle("🌘".repeat(SCENARIO_TITLE_MAX_LENGTH))).toHaveLength(
      SCENARIO_TITLE_MAX_LENGTH * 2,
    );
  });

  it("rejects titles beyond the character limit", () => {
    expect(() => parseScenarioTitle("x".repeat(SCENARIO_TITLE_MAX_LENGTH + 1))).toThrow(
      expect.objectContaining<Partial<InvalidScenarioTitleError>>({ reason: "too-long" }),
    );
  });

  it("rejects titles without text", () => {
    expect(() => parseScenarioTitle(" \n\t ")).toThrow(
      expect.objectContaining<Partial<InvalidScenarioTitleError>>({ reason: "empty" }),
    );
  });

  it("keeps creation inputs exact", () => {
    expect(createScenarioInputSchema.safeParse({ title: "Voyage", ignored: true }).success).toBe(
      false,
    );
    expect(() => parseCreateScenarioInput({ title: "Voyage", ignored: true })).toThrow(
      "Scenario input is invalid.",
    );
    expect(parseCreateScenarioInput({ title: " Voyage " })).toEqual({ title: "Voyage" });
  });
});
