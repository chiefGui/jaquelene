import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import type { ModelSelection } from "#backend/provider/provider";
import { createScenarios } from "#backend/scenario/scenarios";
import { threadTable } from "#backend/thread/schema";
import { createThreads } from "#backend/thread/threads";
import { createCampaigns } from "./campaigns";
import { campaignModelOverrideTable, campaignTable } from "./schema";

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

function modelSelection(id: string): ModelSelection {
  return {
    providerId: "provider-a",
    modelId: id,
    name: `Model ${id}`,
    brandId: "brand-a",
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
    const configured = firstConnection.campaigns.setModelOverride(
      started.id,
      modelSelection("persistent"),
    );

    closeDatabase(firstConnection.database);

    const secondConnection = openCampaigns(path);
    expect(secondConnection.campaigns.get(started.id)).toEqual(configured);
    expect(secondConnection.threads.get(started.threadId)).toEqual({
      id: started.threadId,
      createdAt: started.startedAt,
    });
  });

  it("persists the continuation and resolves the current scenario title", () => {
    const path = createDatabasePath();
    const firstConnection = openCampaigns(path);
    const scenario = firstConnection.scenarios.create("Original continuation title");
    const campaign = firstConnection.campaigns.start(scenario.id);

    expect(firstConnection.campaigns.getContinuation()).toBeNull();
    firstConnection.database.transaction((transaction) =>
      firstConnection.campaigns.recordContinuationInTransaction(transaction, campaign.threadId),
    );
    firstConnection.scenarios.rename(scenario.id, "Renamed continuation title");
    closeDatabase(firstConnection.database);

    const secondConnection = openCampaigns(path);
    expect(secondConnection.campaigns.getContinuation()).toEqual({
      campaignId: campaign.id,
      scenarioId: scenario.id,
      scenarioTitle: "Renamed continuation title",
    });
  });

  it("backfills the continuation from the latest persisted user message", () => {
    const path = createDatabasePath();
    const client = new DatabaseSync(path);

    try {
      client.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE scenarios (id text PRIMARY KEY NOT NULL, title text NOT NULL);
        CREATE TABLE threads (id text PRIMARY KEY NOT NULL);
        CREATE TABLE campaigns (
          id text PRIMARY KEY NOT NULL,
          scenario_id text NOT NULL,
          thread_id text NOT NULL
        );
        CREATE TABLE thread_messages (
          id text PRIMARY KEY NOT NULL,
          thread_id text NOT NULL,
          author text NOT NULL,
          created_at integer NOT NULL
        );
        INSERT INTO scenarios VALUES ('scenario-a', 'First'), ('scenario-b', 'Second');
        INSERT INTO threads VALUES ('thread-a'), ('thread-b');
        INSERT INTO campaigns VALUES
          ('campaign-a', 'scenario-a', 'thread-a'),
          ('campaign-b', 'scenario-b', 'thread-b');
        INSERT INTO thread_messages VALUES
          ('message-a', 'thread-a', 'user', 100),
          ('message-b', 'thread-b', 'user', 200),
          ('message-c', 'thread-a', 'assistant', 300);
      `);
      const migration = readFileSync(
        join(import.meta.dirname, "../migrations/20260831204320_old_ser_duncan/migration.sql"),
        "utf8",
      );

      client.exec(migration);

      expect(client.prepare("SELECT id, campaign_id FROM campaign_continuation").get()).toEqual({
        id: 1,
        campaign_id: "campaign-b",
      });
    } finally {
      client.close();
    }
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

  it("sets, replaces, and clears a campaign model override", () => {
    const { campaigns, database, scenarios } = openCampaigns(createDatabasePath());
    const campaign = campaigns.start(scenarios.create("Model override scenario").id);
    const model = modelSelection("override");
    const replacement = modelSelection("replacement");

    expect(campaigns.setModelOverride(campaign.id, model)).toEqual({
      ...campaign,
      modelOverride: model,
    });
    expect(database.select().from(campaignModelOverrideTable).all()).toEqual([
      { campaignId: campaign.id, ...model },
    ]);
    expect(campaigns.get(campaign.id)).toEqual({ ...campaign, modelOverride: model });
    expect(campaigns.listForScenario(campaign.scenarioId)).toEqual([
      { ...campaign, modelOverride: model },
    ]);
    expect(campaigns.setModelOverride(campaign.id, replacement)).toEqual({
      ...campaign,
      modelOverride: replacement,
    });
    expect(database.select().from(campaignModelOverrideTable).all()).toEqual([
      { campaignId: campaign.id, ...replacement },
    ]);
    expect(campaigns.setModelOverride(campaign.id, null)).toEqual(campaign);
    expect(database.select().from(campaignModelOverrideTable).all()).toEqual([]);
    expect(campaigns.get(campaign.id)).toEqual(campaign);
    expect(campaigns.listForScenario(campaign.scenarioId)).toEqual([campaign]);
  });

  it("rejects an incomplete campaign model override", () => {
    const { campaigns, scenarios } = openCampaigns(createDatabasePath());
    const campaign = campaigns.start(scenarios.create("Invalid model override scenario").id);

    expect(() =>
      campaigns.setModelOverride(campaign.id, {
        ...modelSelection("invalid"),
        providerId: " ",
      }),
    ).toThrow(TypeError);
    expect(campaigns.get(campaign.id)).toEqual(campaign);
  });

  it("does not set a model override on an unknown campaign", () => {
    const { campaigns } = openCampaigns(createDatabasePath());

    expect(campaigns.setModelOverride(ids.campaign.create(), modelSelection("unknown"))).toBeNull();
  });

  it("rejects incomplete or blank stored campaign model overrides", () => {
    const path = createDatabasePath();
    const { campaigns, database, scenarios } = openCampaigns(path);
    const campaign = campaigns.start(scenarios.create("Partial model override scenario").id);
    closeDatabase(database);
    const client = new DatabaseSync(path);

    try {
      expect(() =>
        client
          .prepare(
            "INSERT INTO campaign_model_overrides (campaign_id, provider_id, model_id, name) VALUES (?, ?, ?, ?)",
          )
          .run(campaign.id, "provider-a", "model-a", "Model A"),
      ).toThrow();
      expect(() =>
        client
          .prepare(
            "INSERT INTO campaign_model_overrides (campaign_id, provider_id, model_id, name, brand_id) VALUES (?, ?, ?, ?, ?)",
          )
          .run(campaign.id, "provider-a", "model-a", " ", "brand-a"),
      ).toThrow();
    } finally {
      client.close();
    }
  });

  it("deletes campaign-owned records with their campaign", () => {
    const { campaigns, database, scenarios } = openCampaigns(createDatabasePath());
    const campaign = campaigns.start(scenarios.create("Owned model override scenario").id);
    campaigns.setModelOverride(campaign.id, modelSelection("owned"));
    database.transaction((transaction) =>
      campaigns.recordContinuationInTransaction(transaction, campaign.threadId),
    );

    database.delete(campaignTable).where(eq(campaignTable.id, campaign.id)).run();

    expect(database.select().from(campaignModelOverrideTable).all()).toEqual([]);
    expect(campaigns.getContinuation()).toBeNull();
  });
});
