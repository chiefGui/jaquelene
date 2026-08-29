import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "../database/database";
import { ids } from "../id";
import { createScenarios } from "../scenario/scenarios";
import { threadTable } from "../thread/schema";
import { createThreads } from "../thread/threads";
import { createCampaigns } from "./campaigns";
import { campaignTable } from "./schema";

const directories: string[] = [];
const databases: Database[] = [];

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-campaigns-"));
  directories.push(directory);
  return join(directory, "jaquelene.sqlite");
}

function openCampaigns(path: string, now?: () => number) {
  const database = openDatabase(path);
  databases.push(database);

  return {
    database,
    campaigns: createCampaigns(database, now),
    scenarios: createScenarios(database),
    threads: createThreads(database),
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("campaigns", () => {
  it("starts campaigns for a scenario and lists the newest first", () => {
    let startedAt = 100;
    const { campaigns, scenarios } = openCampaigns(createDatabasePath(), () => startedAt++);
    const scenario = scenarios.create("Campaign scenario");
    const otherScenario = scenarios.create("Other scenario");
    const first = campaigns.start(scenario.id);
    const second = campaigns.start(scenario.id);
    campaigns.start(otherScenario.id);

    expect(first).toEqual({
      id: expect.stringMatching(/^campaign_/),
      scenarioId: scenario.id,
      threadId: expect.stringMatching(/^thread_/),
      startedAt: 100,
    });
    expect(campaigns.listForScenario(scenario.id)).toEqual([second, first]);
  });

  it("persists campaigns when the database is reopened", () => {
    const path = createDatabasePath();
    const firstConnection = openCampaigns(path, () => 200);
    const scenario = firstConnection.scenarios.create("Persistent campaign scenario");
    const started = firstConnection.campaigns.start(scenario.id);

    closeDatabase(firstConnection.database);

    const secondConnection = openCampaigns(path);
    expect(secondConnection.campaigns.get(started.id)).toEqual(started);
    expect(secondConnection.threads.get(started.threadId)).toEqual({
      id: started.threadId,
      createdAt: started.startedAt,
    });
  });

  it("creates a thread with a newly started campaign", () => {
    const { campaigns, scenarios, threads } = openCampaigns(createDatabasePath(), () => 250);
    const scenario = scenarios.create("Threaded campaign scenario");
    const campaign = campaigns.start(scenario.id);

    expect(threads.get(campaign.threadId)).toEqual({
      id: campaign.threadId,
      createdAt: campaign.startedAt,
    });
  });

  it("requires every stored campaign to have an identity", () => {
    const path = createDatabasePath();
    const { database, scenarios, threads } = openCampaigns(path);
    const scenario = scenarios.create("Campaign identity scenario");
    const thread = threads.create();
    closeDatabase(database);

    const client = new DatabaseSync(path);

    try {
      expect(() =>
        client
          .prepare(
            "INSERT INTO campaigns (id, scenario_id, thread_id, started_at) VALUES (?, ?, ?, ?)",
          )
          .run(null, scenario.id, thread.id, 300),
      ).toThrow();
    } finally {
      client.close();
    }
  });

  it("rejects a campaign without an existing scenario", () => {
    const { campaigns, database } = openCampaigns(createDatabasePath());

    expect(() => campaigns.start(ids.scenario.create())).toThrow();
    expect(database.select().from(campaignTable).all()).toEqual([]);
    expect(database.select().from(threadTable).all()).toEqual([]);
  });

  it("returns no campaign for an unknown identity", () => {
    const { campaigns } = openCampaigns(createDatabasePath());

    expect(campaigns.get(ids.campaign.create())).toBeNull();
  });
});
