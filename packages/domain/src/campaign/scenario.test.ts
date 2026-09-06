import { describe, expect, it } from "vite-plus/test";
import { CAMPAIGN_SCENARIO_MAX_LENGTH, parseCampaignScenario } from "./scenario";

describe("campaign scenarios", () => {
  it.each(["", " \t\r\n", "\u00a0\u2003\u2028"])("normalizes blank content %j", (value) => {
    expect(parseCampaignScenario(value)).toBe("");
  });

  it("preserves Markdown indentation and line breaks", () => {
    const markdown = "    code block\n\nA city on the moon.  \nTwo moons overhead.\n";
    expect(parseCampaignScenario(markdown)).toBe(markdown);
  });

  it("enforces the content limit in code points", () => {
    const scenario = "🌙".repeat(CAMPAIGN_SCENARIO_MAX_LENGTH);
    expect(parseCampaignScenario(scenario)).toBe(scenario);
    expect(() => parseCampaignScenario(`${scenario}x`)).toThrow(TypeError);
  });

  it.each([null, undefined, 123, {}])("rejects invalid content %j", (value) => {
    expect(() => parseCampaignScenario(value)).toThrow(TypeError);
  });
});
