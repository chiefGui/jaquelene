import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import type { ReasoningPreset } from "#backend/model/reasoning";
import type { ModelSelection } from "#backend/provider/provider";
import { createScenarios } from "#backend/scenario/scenarios";
import { threadTable } from "#backend/thread/schema";
import { createThreads } from "#backend/thread/threads";
import { createCampaigns, type CampaignGenerationPreferences } from "./campaigns";
import { campaignGenerationPreferencesTable, campaignTable } from "./schema";

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

function generationPreferences(
  id: string | undefined,
  reasoningPreset?: ReasoningPreset,
): CampaignGenerationPreferences {
  return {
    ...(id === undefined ? {} : { model: modelSelection(id) }),
    ...(reasoningPreset === undefined ? {} : { reasoningPreset }),
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
    const scenario = scenarios.create({ title: "Campaign scenario" });
    const otherScenario = scenarios.create({ title: "Other scenario" });
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
    const scenario = firstConnection.scenarios.create({ title: "Persistent campaign scenario" });
    const started = firstConnection.campaigns.start(scenario.id);
    const configured = firstConnection.campaigns.setGenerationPreferences(
      started.id,
      generationPreferences("persistent", "high"),
    );

    closeDatabase(firstConnection.database);

    const secondConnection = openCampaigns(path);
    expect(secondConnection.campaigns.get(started.id)).toEqual(configured);
    expect(secondConnection.threads.get(started.threadId)).toEqual({
      id: started.threadId,
      createdAt: started.startedAt,
    });
  });

  it("creates a thread with a newly started campaign", () => {
    const { campaigns, scenarios, threads } = openCampaigns(createDatabasePath(), () => 250);
    const scenario = scenarios.create({ title: "Threaded campaign scenario" });
    const campaign = campaigns.start(scenario.id);

    expect(threads.get(campaign.threadId)).toEqual({
      id: campaign.threadId,
      createdAt: campaign.startedAt,
    });
  });

  it("requires every stored campaign to have an identity", () => {
    const path = createDatabasePath();
    const { database, scenarios, threads } = openCampaigns(path);
    const scenario = scenarios.create({ title: "Campaign identity scenario" });
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
    const { campaigns, threads } = openCampaigns(createDatabasePath());

    expect(campaigns.get(ids.campaign.create())).toBeNull();
    expect(campaigns.getContextForThread(threads.create().id)).toBeNull();
  });

  it("finds the campaign that owns a thread", () => {
    const { campaigns, scenarios } = openCampaigns(createDatabasePath());
    const campaign = campaigns.start(scenarios.create({ title: "Thread owner" }).id);

    expect(campaigns.getContextForThread(campaign.threadId)).toEqual({
      id: campaign.id,
      scenarioId: campaign.scenarioId,
    });
  });

  it("sets, replaces, and clears independent campaign generation preferences", () => {
    const { campaigns, database, scenarios } = openCampaigns(createDatabasePath());
    const campaign = campaigns.start(
      scenarios.create({ title: "Generation preferences scenario" }).id,
    );
    const preferences = generationPreferences("selected", "high");
    const replacement = generationPreferences(undefined, "low");

    expect(campaigns.setGenerationPreferences(campaign.id, preferences)).toEqual({
      ...campaign,
      generationPreferences: preferences,
    });
    expect(database.select().from(campaignGenerationPreferencesTable).all()).toEqual([
      { campaignId: campaign.id, ...preferences.model, reasoningPreset: "high" },
    ]);
    expect(campaigns.get(campaign.id)).toEqual({
      ...campaign,
      generationPreferences: preferences,
    });
    expect(campaigns.listForScenario(campaign.scenarioId)).toEqual([
      { ...campaign, generationPreferences: preferences },
    ]);
    expect(campaigns.setGenerationPreferences(campaign.id, replacement)).toEqual({
      ...campaign,
      generationPreferences: replacement,
    });
    expect(database.select().from(campaignGenerationPreferencesTable).all()).toEqual([
      {
        campaignId: campaign.id,
        providerId: null,
        modelId: null,
        name: null,
        brandId: null,
        reasoningPreset: "low",
      },
    ]);
    expect(campaigns.setGenerationPreferences(campaign.id, null)).toEqual(campaign);
    expect(database.select().from(campaignGenerationPreferencesTable).all()).toEqual([]);
    expect(campaigns.get(campaign.id)).toEqual(campaign);
    expect(campaigns.listForScenario(campaign.scenarioId)).toEqual([campaign]);
  });

  it("rejects empty or invalid campaign generation preferences", () => {
    const { campaigns, scenarios } = openCampaigns(createDatabasePath());
    const campaign = campaigns.start(
      scenarios.create({ title: "Invalid configuration scenario" }).id,
    );

    expect(() =>
      campaigns.setGenerationPreferences(campaign.id, {
        model: { ...modelSelection("invalid"), providerId: " " },
      }),
    ).toThrow(TypeError);
    expect(() => campaigns.setGenerationPreferences(campaign.id, {})).toThrow(TypeError);
    expect(campaigns.get(campaign.id)).toEqual(campaign);
  });

  it("does not set generation preferences on an unknown campaign", () => {
    const { campaigns } = openCampaigns(createDatabasePath());

    expect(
      campaigns.setGenerationPreferences(ids.campaign.create(), generationPreferences("unknown")),
    ).toBeNull();
  });

  it("rejects empty, incomplete, blank, or invalid stored generation preferences", () => {
    const path = createDatabasePath();
    const { campaigns, database, scenarios } = openCampaigns(path);
    const campaign = campaigns.start(
      scenarios.create({ title: "Partial configuration scenario" }).id,
    );
    closeDatabase(database);
    const client = new DatabaseSync(path);

    try {
      expect(() =>
        client
          .prepare(
            "INSERT INTO campaign_generation_preferences (campaign_id, provider_id, model_id, name) VALUES (?, ?, ?, ?)",
          )
          .run(campaign.id, "provider-a", "model-a", "Model A"),
      ).toThrow();
      expect(() =>
        client
          .prepare(
            "INSERT INTO campaign_generation_preferences (campaign_id, provider_id, model_id, name, brand_id) VALUES (?, ?, ?, ?, ?)",
          )
          .run(campaign.id, "provider-a", "model-a", " ", "brand-a"),
      ).toThrow();
      expect(() =>
        client
          .prepare(
            "INSERT INTO campaign_generation_preferences (campaign_id, provider_id, model_id, name, brand_id, reasoning_preset) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(campaign.id, "provider-a", "model-a", "Model A", "brand-a", "extreme"),
      ).toThrow();
      expect(() =>
        client
          .prepare("INSERT INTO campaign_generation_preferences (campaign_id) VALUES (?)")
          .run(campaign.id),
      ).toThrow();
    } finally {
      client.close();
    }
  });

  it("deletes generation preferences with their owning campaign", () => {
    const { campaigns, database, scenarios } = openCampaigns(createDatabasePath());
    const campaign = campaigns.start(scenarios.create({ title: "Owned preferences scenario" }).id);
    campaigns.setGenerationPreferences(campaign.id, generationPreferences("owned"));

    database.delete(campaignTable).where(eq(campaignTable.id, campaign.id)).run();

    expect(database.select().from(campaignGenerationPreferencesTable).all()).toEqual([]);
  });
});
