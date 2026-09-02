import { describe, expect, it } from "vite-plus/test";
import {
  ROLEPLAY_INSTRUCTION_BODY_MAX_LENGTH,
  ROLEPLAY_INSTRUCTION_TITLE_MAX_LENGTH,
  composeCampaignRoleplayInstructionKey,
  parseRoleplayInstructionInput,
  setCampaignRoleplayInstructionPreference,
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

describe("campaign roleplay instruction preferences", () => {
  const factory = "factory";
  const defaultInstruction = "default";
  const custom = "custom";

  it("composes inheritance and explicit campaign choices", () => {
    expect(composeCampaignRoleplayInstructionKey(factory, defaultInstruction, undefined)).toBe(
      defaultInstruction,
    );
    expect(
      composeCampaignRoleplayInstructionKey(factory, defaultInstruction, {
        instructionKey: null,
      }),
    ).toBe(factory);
    expect(
      composeCampaignRoleplayInstructionKey(factory, defaultInstruction, {
        instructionKey: custom,
      }),
    ).toBe(custom);
  });

  it("stores only choices that differ from the current default", () => {
    expect(
      setCampaignRoleplayInstructionPreference(factory, defaultInstruction, defaultInstruction),
    ).toBeUndefined();
    expect(setCampaignRoleplayInstructionPreference(factory, defaultInstruction, factory)).toEqual({
      instructionKey: null,
    });
    expect(setCampaignRoleplayInstructionPreference(factory, defaultInstruction, custom)).toEqual({
      instructionKey: custom,
    });
  });
});
