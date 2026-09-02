import { describe, expect, it } from "vite-plus/test";
import { ids } from "#backend/id";
import { createInstructionRegistry, type InstructionSource } from "./registry";

const testInstruction = {
  key: "test.roleplay.default",
  title: "Default",
  body: "Test roleplay instructions.",
  origin: "factory" as const,
};

const catalogSource: InstructionSource = {
  listGroups: () => [
    {
      key: "roleplay",
      name: "Roleplay",
      description: "Test roleplay instructions.",
      instructions: [testInstruction],
    },
  ],
  resolve: ({ campaign }) => (campaign ? [testInstruction] : []),
};

describe("instruction registry", () => {
  it("lists source instructions for inspection", () => {
    const instructions = createInstructionRegistry([catalogSource]);

    expect(instructions.listGroups()).toEqual([
      {
        key: "roleplay",
        name: "Roleplay",
        description: "Test roleplay instructions.",
        instructions: [
          {
            key: "test.roleplay.default",
            title: "Default",
            body: expect.any(String),
            origin: "factory",
          },
        ],
      },
    ]);
    expect(instructions.listGroups()[0]!.instructions[0]!.body.trim()).not.toBe("");
  });

  it("returns owned listings", () => {
    const instructions = createInstructionRegistry([catalogSource]);
    const first = instructions.listGroups();

    (first[0]!.instructions[0] as { title: string }).title = "Changed outside the catalog";

    expect(instructions.listGroups()[0]!.instructions[0]!.title).toBe("Default");
  });

  it("resolves source instructions from context", () => {
    const instructions = createInstructionRegistry([catalogSource]);
    const threadId = ids.thread.create();

    expect(instructions.resolve({ threadId, campaign: null })).toEqual([]);
    const instruction = instructions.listGroups()[0]!.instructions[0]!;

    expect(
      instructions.resolve({
        threadId,
        campaign: {
          id: ids.campaign.create(),
          scenarioId: ids.scenario.create(),
        },
      }),
    ).toEqual([
      {
        sourceKey: instruction.key,
        content: instruction.body,
      },
    ]);
  });

  it("owns and preserves source order", () => {
    const source = (key: string): InstructionSource => ({
      listGroups: () => [],
      resolve: () => [{ key, title: key, body: `${key} content` }],
    });
    const sources = [source("global"), source("scenario")];
    const instructions = createInstructionRegistry(sources);
    sources.reverse();
    sources.push(source("campaign"));

    expect(
      instructions.resolve({
        threadId: ids.thread.create(),
        campaign: null,
      }),
    ).toEqual([
      { sourceKey: "global", content: "global content" },
      { sourceKey: "scenario", content: "scenario content" },
    ]);
  });
});
