import { describe, expect, it } from "vite-plus/test";
import { requireModelInput, type ModelInput } from "./input";

function validInput(): ModelInput {
  return {
    instructions: [{ sourceKey: "test.instruction", content: "Instruction" }],
    dialogue: [{ sourceKey: "editor-input", role: "user", content: "Hello" }],
  };
}

describe("model input", () => {
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
    const sourceKey = "editor-input";

    expect(() =>
      requireModelInput({
        ...input,
        dialogue: [{ sourceKey, role: "system", content: "Not dialogue" }],
      } as unknown as ModelInput),
    ).toThrow('unsupported dialogue role "system"');
    expect(() =>
      requireModelInput({
        ...input,
        dialogue: [
          { sourceKey, role: "user", content: "First" },
          { sourceKey, role: "assistant", content: "Second" },
        ],
      }),
    ).toThrow(`duplicate message "${sourceKey}"`);
  });
});
