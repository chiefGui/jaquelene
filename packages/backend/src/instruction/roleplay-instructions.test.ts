import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createCampaigns } from "#backend/campaign/campaigns";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import { createScenarios } from "#backend/scenario/scenarios";
import { createInstructionRegistry } from "./registry";
import { createRoleplayInstructions } from "./roleplay-instructions";

const directories: string[] = [];
const databases: Database[] = [];

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-roleplay-instructions-"));
  directories.push(directory);
  return join(directory, "jaquelene.sqlite");
}

function openInstructions(path: string, now?: () => number) {
  const database = openDatabase(path);
  databases.push(database);
  const campaigns = createCampaigns(database);
  const scenarios = createScenarios(database);
  const instructions = createRoleplayInstructions(database, now);
  return { campaigns, database, instructions, scenarios };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("roleplay instructions", () => {
  it("lists the built-in instruction before persistent custom instructions", () => {
    const path = createDatabasePath();
    const first = openInstructions(path, () => 100);
    const created = first.instructions.create({
      title: "  Noir  ",
      body: "Keep the prose shadowy.",
    });
    const campaign = first.campaigns.start(first.scenarios.create({ title: "Noir story" }).id);
    first.instructions.setCampaignSelection(campaign.id, created.key);

    expect(created).toEqual({
      key: expect.stringMatching(/^instruction_/),
      title: "Noir",
      body: "Keep the prose shadowy.",
      origin: "custom",
    });
    expect(first.instructions.listGroups()[0]!.instructions).toEqual([
      expect.objectContaining({ key: "factory.roleplay.default", origin: "factory" }),
      created,
    ]);

    closeDatabase(first.database);
    const reopened = openInstructions(path);
    expect(reopened.instructions.listGroups()[0]!.instructions).toEqual([
      expect.objectContaining({ key: "factory.roleplay.default", origin: "factory" }),
      created,
    ]);
    expect(reopened.instructions.getCampaignSelection(campaign.id)).toBe(created.key);
  });

  it("updates and deletes custom instructions", () => {
    const { instructions } = openInstructions(createDatabasePath());
    const created = instructions.create({ title: "Original", body: "Original body" });
    const id = ids.instruction.parse(created.key);

    expect(instructions.update(id, { title: "Revised", body: "Revised body" })).toEqual({
      ...created,
      title: "Revised",
      body: "Revised body",
    });
    expect(instructions.delete(id)).toBe(true);
    expect(instructions.delete(id)).toBe(false);
    expect(instructions.update(id, { title: "Missing", body: "Missing body" })).toBeNull();
  });

  it("selects one instruction per campaign and submits only its body", () => {
    const { campaigns, instructions, scenarios } = openInstructions(createDatabasePath());
    const campaign = campaigns.start(scenarios.create({ title: "Selection" }).id);
    const custom = instructions.create({
      title: "Organizational title",
      body: "This body reaches the model.",
    });
    const registry = createInstructionRegistry([instructions]);
    const context = {
      threadId: campaign.threadId,
      campaign: { id: campaign.id, scenarioId: campaign.scenarioId },
    };

    expect(registry.resolve({ threadId: ids.thread.create(), campaign: null })).toEqual([]);
    expect(instructions.getCampaignSelection(campaign.id)).toBe("factory.roleplay.default");
    expect(instructions.setCampaignSelection(campaign.id, custom.key)).toBe(custom.key);
    expect(instructions.getCampaignSelection(campaign.id)).toBe(custom.key);
    expect(registry.resolve(context)).toEqual([
      { sourceKey: custom.key, content: "This body reaches the model." },
    ]);
    expect(JSON.stringify(registry.resolve(context))).not.toContain("Organizational title");
    expect(instructions.setCampaignSelection(campaign.id, "factory.roleplay.default")).toBe(
      "factory.roleplay.default",
    );
    expect(instructions.getCampaignSelection(campaign.id)).toBe("factory.roleplay.default");
  });

  it("uses an updated selection on the next resolution in an existing campaign", () => {
    const { campaigns, instructions, scenarios } = openInstructions(createDatabasePath());
    const campaign = campaigns.start(scenarios.create({ title: "Mutable campaign" }).id);
    const custom = instructions.create({ title: "First title", body: "First body" });
    const id = ids.instruction.parse(custom.key);
    const registry = createInstructionRegistry([instructions]);
    const context = {
      threadId: campaign.threadId,
      campaign: { id: campaign.id, scenarioId: campaign.scenarioId },
    };
    instructions.setCampaignSelection(campaign.id, custom.key);

    expect(registry.resolve(context)[0]!.content).toBe("First body");
    instructions.update(id, { title: "Second title", body: "Second body" });
    expect(registry.resolve(context)[0]!.content).toBe("Second body");
  });

  it("returns selected campaigns to the built-in instruction when custom content is deleted", () => {
    const { campaigns, instructions, scenarios } = openInstructions(createDatabasePath());
    const campaign = campaigns.start(scenarios.create({ title: "Fallback" }).id);
    const custom = instructions.create({ title: "Temporary", body: "Temporary body" });
    instructions.setCampaignSelection(campaign.id, custom.key);

    instructions.delete(ids.instruction.parse(custom.key));

    expect(instructions.getCampaignSelection(campaign.id)).toBe("factory.roleplay.default");
    expect(
      createInstructionRegistry([instructions]).resolve({
        threadId: campaign.threadId,
        campaign: { id: campaign.id, scenarioId: campaign.scenarioId },
      })[0]!.sourceKey,
    ).toBe("factory.roleplay.default");
  });

  it("rejects unavailable selections and protects stored content invariants", () => {
    const path = createDatabasePath();
    const { campaigns, database, instructions, scenarios } = openInstructions(path);
    const campaign = campaigns.start(scenarios.create({ title: "Validation" }).id);

    expect(() => instructions.setCampaignSelection(campaign.id, ids.instruction.create())).toThrow(
      RangeError,
    );
    expect(instructions.getCampaignSelection(ids.campaign.create())).toBeNull();
    expect(
      instructions.setCampaignSelection(ids.campaign.create(), "factory.roleplay.default"),
    ).toBeNull();

    closeDatabase(database);
    const client = new DatabaseSync(path);

    try {
      expect(() =>
        client
          .prepare(
            "INSERT INTO roleplay_instructions (id, title, body, created_at) VALUES (?, ?, ?, ?)",
          )
          .run(ids.instruction.create(), "Invalid ", "Body", 0),
      ).toThrow();
      expect(() =>
        client
          .prepare(
            "INSERT INTO roleplay_instructions (id, title, body, created_at) VALUES (?, ?, ?, ?)",
          )
          .run(ids.instruction.create(), "Title", " \n ", 0),
      ).toThrow();
    } finally {
      client.close();
    }
  });
});
