import { describe, expect, it } from "vite-plus/test";
import { ids } from "#backend/id";
import { composeSystemPrompt, requireModelInput, type ModelInput } from "./input";

function validInput(): ModelInput {
  return {
    instructions: [{ sourceKey: "test.instruction", content: "Instruction" }],
    dialogue: [{ messageId: ids.message.create(), role: "user", content: "Hello" }],
  };
}

describe("model input", () => {
  it("composes instructions as one system prompt without an empty section", () => {
    const narrator = { sourceKey: "narrator", content: "Narrate clearly." };
    const scenario = { sourceKey: "scenario", content: "## Scenario\nA lost kingdom." };
    expect(composeSystemPrompt([narrator, scenario])).toBe(
      "Narrate clearly.\n\n## Scenario\nA lost kingdom.",
    );
    expect(composeSystemPrompt([narrator])).toBe("Narrate clearly.");
    expect(composeSystemPrompt([])).toBe("");
  });

  it("returns an owned semantic input", () => {
    const source = validInput();
    const input = requireModelInput(source);

    expect(input).toEqual(source);
    expect(input).not.toBe(source);
    expect(input.instructions).not.toBe(source.instructions);
    expect(input.dialogue).not.toBe(source.dialogue);
  });

  it("rejects invalid instructions", () => {
    const input = validInput();

    expect(() =>
      requireModelInput({
        ...input,
        instructions: [{ sourceKey: " ", content: "Instruction" }],
      }),
    ).toThrow("requires an instruction source key");
    expect(() =>
      requireModelInput({
        ...input,
        instructions: [
          { sourceKey: "duplicate", content: "First" },
          { sourceKey: "duplicate", content: "Second" },
        ],
      }),
    ).toThrow('duplicate instruction source "duplicate"');
  });

  it("rejects invalid dialogue", () => {
    const input = validInput();
    const messageId = ids.message.create();

    expect(() =>
      requireModelInput({
        ...input,
        dialogue: [{ messageId, role: "system", content: "Not dialogue" }],
      } as unknown as ModelInput),
    ).toThrow('unsupported dialogue role "system"');
    expect(() =>
      requireModelInput({
        ...input,
        dialogue: [
          { messageId, role: "user", content: "First" },
          { messageId, role: "assistant", content: "Second" },
        ],
      }),
    ).toThrow(`duplicate message "${messageId}"`);
  });
});
