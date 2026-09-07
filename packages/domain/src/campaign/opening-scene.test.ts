import { describe, expect, it } from "vite-plus/test";
import { parseCreatePromptInput, PROMPT_BODY_MAX_LENGTH } from "../prompt/content";
import {
  CAMPAIGN_OPENING_SCENE_MAX_LENGTH,
  campaignOpeningSceneSchema,
  parseCampaignOpeningScene,
} from "./opening-scene";

describe("opening scenes", () => {
  it("preserves exact nonblank Markdown and treats blank text as an omitted opening", () => {
    const text = "    John wakes up.\n\nSomeone knocks. \u{1f319}\n";
    expect(parseCampaignOpeningScene(text)).toBe(text);
    expect(parseCampaignOpeningScene(" \t\n\u2003")).toBe("");
    expect(() => parseCampaignOpeningScene(null)).toThrow(TypeError);
  });
  it("matches the library limit including supplementary Unicode characters", () => {
    expect(CAMPAIGN_OPENING_SCENE_MAX_LENGTH).toBe(20_000);
    expect(CAMPAIGN_OPENING_SCENE_MAX_LENGTH).toBe(PROMPT_BODY_MAX_LENGTH);
    expect(
      campaignOpeningSceneSchema.safeParse("a".repeat(CAMPAIGN_OPENING_SCENE_MAX_LENGTH)).success,
    ).toBe(true);
    const text = "\u{1f319}".repeat(CAMPAIGN_OPENING_SCENE_MAX_LENGTH);
    expect(parseCampaignOpeningScene(text)).toBe(text);
    expect(
      parseCreatePromptInput({ kind: "opening-scene", title: "Morning", body: text }).body,
    ).toBe(text);
    expect(() => parseCampaignOpeningScene(text + "a")).toThrow(TypeError);
    expect(() =>
      parseCreatePromptInput({ kind: "opening-scene", title: "Morning", body: text + "a" }),
    ).toThrow(TypeError);
  });
});
