import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "@/database";
import { createScenarios } from "@/feature/scenario/scenarios";
import { createCampaigns } from "./campaigns";

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
      id: expect.any(String),
      scenarioId: scenario.id,
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

    expect(openCampaigns(path).campaigns.get(started.id)).toEqual(started);
  });

  it("requires every stored campaign to have an identity", () => {
    const path = createDatabasePath();
    const { database, scenarios } = openCampaigns(path);
    const scenario = scenarios.create("Campaign identity scenario");
    closeDatabase(database);

    const client = new DatabaseSync(path);

    try {
      expect(() =>
        client
          .prepare("INSERT INTO campaigns (id, scenario_id, started_at) VALUES (?, ?, ?)")
          .run(null, scenario.id, 300),
      ).toThrow();
    } finally {
      client.close();
    }
  });

  it("rejects a campaign without an existing scenario", () => {
    const { campaigns } = openCampaigns(createDatabasePath());

    expect(() => campaigns.start("missing-scenario")).toThrow();
  });

  it("returns no campaign for an unknown identity", () => {
    const { campaigns } = openCampaigns(createDatabasePath());

    expect(campaigns.get("missing-campaign")).toBeNull();
  });
});
