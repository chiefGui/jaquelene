import { describe, expect, it } from "vite-plus/test";
import {
  PROMPT_BODY_MAX_LENGTH,
  PROMPT_TITLE_MAX_LENGTH,
  parseCreatePromptInput,
  parseUpdatePromptInput,
} from "./content";

describe("prompt content", () => {
  it("normalizes titles and preserves bodies", () => {
    expect(
      parseCreatePromptInput({
        kind: "test",
        title: "  Test prompt  ",
        body: "  Preserve this spacing.\n",
      }),
    ).toEqual({
      kind: "test",
      title: "Test prompt",
      body: "  Preserve this spacing.\n",
    });
  });

  it("requires a valid kind and text in both fields", () => {
    expect(() => parseCreatePromptInput({ kind: "Invalid", title: "Title", body: "Body" })).toThrow(
      TypeError,
    );
    expect(() => parseCreatePromptInput({ kind: "test", title: " ", body: "Body" })).toThrow(
      TypeError,
    );
    expect(() => parseUpdatePromptInput({ title: "Title", body: " \n\t " })).toThrow(TypeError);
  });

  it("bounds titles and bodies", () => {
    expect(
      parseUpdatePromptInput({
        title: "t".repeat(PROMPT_TITLE_MAX_LENGTH),
        body: "b".repeat(PROMPT_BODY_MAX_LENGTH),
      }),
    ).toBeDefined();
    expect(() =>
      parseUpdatePromptInput({
        title: "t".repeat(PROMPT_TITLE_MAX_LENGTH + 1),
        body: "Body",
      }),
    ).toThrow(TypeError);
    expect(() =>
      parseUpdatePromptInput({
        title: "Title",
        body: "b".repeat(PROMPT_BODY_MAX_LENGTH + 1),
      }),
    ).toThrow(TypeError);
  });
});
