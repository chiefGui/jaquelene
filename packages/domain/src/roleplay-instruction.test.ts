import { describe, expect, it } from "vite-plus/test";
import {
  ROLEPLAY_INSTRUCTION_BODY_MAX_LENGTH,
  ROLEPLAY_INSTRUCTION_TITLE_MAX_LENGTH,
  parseRoleplayInstructionInput,
} from "./roleplay-instruction";

describe("roleplay instruction input", () => {
  it("trims the title while preserving the body", () => {
    expect(
      parseRoleplayInstructionInput({
        title: "  Tense narrator  ",
        body: "  Keep the narration tense.\n",
      }),
    ).toEqual({
      title: "Tense narrator",
      body: "  Keep the narration tense.\n",
    });
  });

  it("requires text in both fields", () => {
    expect(() => parseRoleplayInstructionInput({ title: " ", body: "Body" })).toThrow(TypeError);
    expect(() => parseRoleplayInstructionInput({ title: "Title", body: " \n\t " })).toThrow(
      TypeError,
    );
  });

  it("bounds titles and prompt bodies", () => {
    expect(
      parseRoleplayInstructionInput({
        title: "t".repeat(ROLEPLAY_INSTRUCTION_TITLE_MAX_LENGTH),
        body: "b".repeat(ROLEPLAY_INSTRUCTION_BODY_MAX_LENGTH),
      }),
    ).toBeDefined();
    expect(() =>
      parseRoleplayInstructionInput({
        title: "t".repeat(ROLEPLAY_INSTRUCTION_TITLE_MAX_LENGTH + 1),
        body: "Body",
      }),
    ).toThrow(TypeError);
    expect(() =>
      parseRoleplayInstructionInput({
        title: "Title",
        body: "b".repeat(ROLEPLAY_INSTRUCTION_BODY_MAX_LENGTH + 1),
      }),
    ).toThrow(TypeError);
  });
});
