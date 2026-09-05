import { describe, expect, it } from "vite-plus/test";
import {
  SKILL_TITLE_MAX_LENGTH,
  parseCreateSkillInput,
  parseSkillContent,
  parseUpdateSkillInput,
} from "./content";
import { PROMPT_MAX_LENGTH } from "../prompt/content";

describe("skill content", () => {
  it("normalizes titles and preserves prompts", () => {
    expect(
      parseCreateSkillInput({
        kind: "test",
        title: "  Test prompt  ",
        prompt: "  Preserve this spacing.\n",
      }),
    ).toEqual({
      kind: "test",
      title: "Test prompt",
      prompt: "  Preserve this spacing.\n",
    });
    expect(parseSkillContent({ title: "  Factory prompt  ", prompt: "Instructions" })).toEqual({
      title: "Factory prompt",
      prompt: "Instructions",
    });
  });

  it("requires a valid kind and text in both fields", () => {
    expect(() =>
      parseCreateSkillInput({ kind: "Invalid", title: "Title", prompt: "Body" }),
    ).toThrow(TypeError);
    expect(() => parseCreateSkillInput({ kind: "test", title: " ", prompt: "Body" })).toThrow(
      TypeError,
    );
    expect(() => parseUpdateSkillInput({ title: "Title", prompt: " \n\t " })).toThrow(TypeError);
  });

  it("bounds titles and prompts", () => {
    expect(
      parseUpdateSkillInput({
        title: "t".repeat(SKILL_TITLE_MAX_LENGTH),
        prompt: "b".repeat(PROMPT_MAX_LENGTH),
      }),
    ).toBeDefined();
    expect(() =>
      parseUpdateSkillInput({
        title: "t".repeat(SKILL_TITLE_MAX_LENGTH + 1),
        prompt: "Body",
      }),
    ).toThrow(TypeError);
    expect(() =>
      parseUpdateSkillInput({
        title: "Title",
        prompt: "b".repeat(PROMPT_MAX_LENGTH + 1),
      }),
    ).toThrow(TypeError);
  });
});
