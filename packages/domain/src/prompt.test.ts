import { describe, expect, it } from "vite-plus/test";
import {
  PROMPT_BODY_MAX_LENGTH,
  PROMPT_TITLE_MAX_LENGTH,
  parseCreatePromptInput,
  parsePromptKey,
  parseUpdatePromptInput,
} from "./prompt";

describe("prompt input", () => {
  it("parses opaque prompt keys", () => {
    expect(parsePromptKey("factory.narrator.jaquelene")).toBe("factory.narrator.jaquelene");
    expect(() => parsePromptKey("")).toThrow("Prompt key is invalid.");
  });

  it("normalizes titles and preserves bodies", () => {
    expect(
      parseCreatePromptInput({
        kind: "narrator",
        title: "  Tense narrator  ",
        body: "  Keep the narration tense.\n",
      }),
    ).toEqual({
      kind: "narrator",
      title: "Tense narrator",
      body: "  Keep the narration tense.\n",
    });
  });

  it("requires a valid kind and text in both fields", () => {
    expect(() =>
      parseCreatePromptInput({ kind: "Narrator", title: "Title", body: "Body" }),
    ).toThrow(TypeError);
    expect(() => parseCreatePromptInput({ kind: "narrator", title: " ", body: "Body" })).toThrow(
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
