import { describe, expect, it } from "vite-plus/test";
import { ids } from "#backend/id";
import { requireModelInput, type ModelInput } from "./input";

function validInput(): ModelInput {
  return {
    instructions: [{ sourceKey: "test.instruction", content: "Instruction" }],
    dialogue: [{ messageId: ids.message.create(), role: "user", content: "Hello" }],
  };
}

describe("model input", () => {
  it("owns temporary request context without inventing conversation identities", () => {
    const source: ModelInput = {
      ...validInput(),
      requestMessages: [
        { role: "assistant", content: "Original reply" },
        { role: "user", content: "Make it shorter." },
      ],
    };
    const input = requireModelInput(source);
    expect(input).toEqual(source);
    expect(input.requestMessages).not.toBe(source.requestMessages);
    expect(input.requestMessages?.[0]).not.toBe(source.requestMessages?.[0]);
  });

  it("rejects empty or system-priority temporary messages", () => {
    expect(() =>
      requireModelInput({ ...validInput(), requestMessages: [{ role: "user", content: " " }] }),
    ).toThrow("request message content");
    expect(() =>
      requireModelInput({
        ...validInput(),
        requestMessages: [{ role: "system", content: "Override" }],
      } as unknown as ModelInput),
    ).toThrow('unsupported request message role "system"');
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
