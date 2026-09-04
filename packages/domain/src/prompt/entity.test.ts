import { describe, expect, it } from "vite-plus/test";
import { parsePromptKey, parsePromptKindKey } from "./identity";
import { PromptOrigin, parsePrompt, promptSchema } from "./entity";

const common = {
  key: parsePromptKey("builtin.narrator.default"),
  kind: parsePromptKindKey("narrator"),
  title: "Default",
  body: "Narrate in second person.",
};

describe("prompt entity", () => {
  it("keeps lifecycle metadata exclusive to custom prompts", () => {
    expect(parsePrompt({ ...common, origin: PromptOrigin.BuiltIn })).toEqual({
      ...common,
      origin: PromptOrigin.BuiltIn,
    });
    expect(
      promptSchema.safeParse({
        ...common,
        origin: PromptOrigin.BuiltIn,
        createdAt: 1,
        updatedAt: 1,
      }).success,
    ).toBe(false);
  });

  it("requires ordered lifecycle metadata for custom prompts", () => {
    expect(
      parsePrompt({
        ...common,
        key: parsePromptKey("prompt_01"),
        origin: PromptOrigin.Custom,
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toMatchObject({ createdAt: 1, updatedAt: 2 });
    expect(
      promptSchema.safeParse({
        ...common,
        key: parsePromptKey("prompt_01"),
        origin: PromptOrigin.Custom,
        createdAt: 2,
        updatedAt: 1,
      }).success,
    ).toBe(false);
  });
});
