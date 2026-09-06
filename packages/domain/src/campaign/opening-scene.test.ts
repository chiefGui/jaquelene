import { describe, expect, it } from "vite-plus/test";
import { THREAD_MESSAGE_MAX_CODE_UNITS } from "../thread/content";
import { campaignOpeningSceneSchema, parseCampaignOpeningScene } from "./opening-scene";

describe("opening scenes", () => {
  it("preserves exact nonblank Markdown and treats blank text as an omitted opening", () => {
    const text = "    John wakes up.\n\nSomeone knocks. ??\n";
    expect(parseCampaignOpeningScene(text)).toBe(text);
    expect(parseCampaignOpeningScene(" \t\n\u2003")).toBe("");
    expect(() => parseCampaignOpeningScene(null)).toThrow(TypeError);
  });
  it("uses the message storage limit including supplementary Unicode characters", () => {
    expect(
      campaignOpeningSceneSchema.safeParse("a".repeat(THREAD_MESSAGE_MAX_CODE_UNITS)).success,
    ).toBe(true);
    const text = "??".repeat(THREAD_MESSAGE_MAX_CODE_UNITS / 2);
    expect(parseCampaignOpeningScene(text)).toBe(text);
    expect(() => parseCampaignOpeningScene(text + "a")).toThrow(TypeError);
  });
});
