import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createCampaigns } from "#backend/campaign/campaigns";
import { campaignTable } from "#backend/campaign/schema";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import { ids } from "#backend/id";
import { createScenarios } from "#backend/scenario/scenarios";
import { scenarioTable } from "#backend/scenario/schema";
import { threadTable, turnTable } from "#backend/thread/schema";
import { createThreads } from "#backend/thread/threads";
import { createContentStorageArea } from "./content";

const databases: Database[] = [];
const directories: string[] = [];

function createTestDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-content-storage-"));
  const path = join(directory, "jaquelene.sqlite");
  const database = openDatabase(path);
  directories.push(directory);
  databases.push(database);
  return { database, path };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("content storage area", () => {
  it("deletes every content record through one transaction", async () => {
    const { database, path } = createTestDatabase();
    const scenario = createScenarios(database).create("The Long Night");
    const campaign = createCampaigns(database).start(scenario.id);
    createThreads(database).startTurn(campaign.threadId, "Begin the story.");
    const area = createContentStorageArea(database, path);

    await area.delete();

    expect(database.select().from(generationTable).all()).toEqual([]);
    expect(database.select().from(campaignTable).all()).toEqual([]);
    expect(database.select().from(turnTable).all()).toEqual([]);
    expect(database.select().from(threadTable).all()).toEqual([]);
    expect(database.select().from(scenarioTable).all()).toEqual([]);
    expect(() => area.delete()).not.toThrow();
  });

  it("preserves content while a reply is being generated", () => {
    const { database, path } = createTestDatabase();
    const scenario = createScenarios(database).create("The Long Night");
    const campaign = createCampaigns(database).start(scenario.id);
    const { turn } = createThreads(database).startTurn(campaign.threadId, "Begin the story.");
    database
      .insert(generationTable)
      .values({
        id: ids.generation.create(),
        turnId: turn.id,
        providerId: "provider-a",
        modelId: "model-a",
        status: "pending",
        startedAt: 0,
      })
      .run();
    const area = createContentStorageArea(database, path);

    expect(() => area.delete()).toThrow(
      "Content cannot be deleted while a reply is being generated.",
    );
    expect(database.select().from(scenarioTable).all()).toHaveLength(1);
    expect(database.select().from(campaignTable).all()).toHaveLength(1);
    expect(database.select().from(threadTable).all()).toHaveLength(1);
    expect(database.select().from(generationTable).all()).toHaveLength(1);
  });
});
