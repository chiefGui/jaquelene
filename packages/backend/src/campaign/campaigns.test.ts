import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import type { GenerationConfigurationSelection, ModelSelection } from "#backend/provider/provider";
import type { ReasoningPreset } from "#backend/model/reasoning";
import { createScenarios } from "#backend/scenario/scenarios";
import { threadTable } from "#backend/thread/schema";
import { createThreads } from "#backend/thread/threads";
import { createCampaigns } from "./campaigns";
import { campaignGenerationConfigurationOverrideTable, campaignTable } from "./schema";

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

function generationConfiguration(
  id: string,
  reasoningPresetOverride?: ReasoningPreset,
): GenerationConfigurationSelection {
  return {
    model: modelSelection(id),
    ...(reasoningPresetOverride === undefined ? {} : { reasoningPresetOverride }),
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
    const configured = firstConnection.campaigns.setGenerationConfigurationOverride(
      started.id,
      generationConfiguration("persistent", "high"),
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
    const { campaigns, threads } = openCampaigns(createDatabasePath());

    expect(campaigns.get(ids.campaign.create())).toBeNull();
    expect(campaigns.getContextForThread(threads.create().id)).toBeNull();
  });

  it("finds the campaign that owns a thread", () => {
    const { campaigns, scenarios } = openCampaigns(createDatabasePath());
    const campaign = campaigns.start(scenarios.create("Thread owner").id);

    expect(campaigns.getContextForThread(campaign.threadId)).toEqual({
      id: campaign.id,
      scenarioId: campaign.scenarioId,
    });
  });

  it("sets, replaces, and clears a campaign generation configuration override", () => {
    const { campaigns, database, scenarios } = openCampaigns(createDatabasePath());
    const campaign = campaigns.start(scenarios.create("Configuration override scenario").id);
    const configuration = generationConfiguration("override", "high");
    const replacement = generationConfiguration("replacement");

    expect(campaigns.setGenerationConfigurationOverride(campaign.id, configuration)).toEqual({
      ...campaign,
      generationConfigurationOverride: configuration,
    });
    expect(database.select().from(campaignGenerationConfigurationOverrideTable).all()).toEqual([
      { campaignId: campaign.id, ...configuration.model, reasoningPresetOverride: "high" },
    ]);
    expect(campaigns.get(campaign.id)).toEqual({
      ...campaign,
      generationConfigurationOverride: configuration,
    });
    expect(campaigns.listForScenario(campaign.scenarioId)).toEqual([
      { ...campaign, generationConfigurationOverride: configuration },
    ]);
    expect(campaigns.setGenerationConfigurationOverride(campaign.id, replacement)).toEqual({
      ...campaign,
      generationConfigurationOverride: replacement,
    });
    expect(database.select().from(campaignGenerationConfigurationOverrideTable).all()).toEqual([
      { campaignId: campaign.id, ...replacement.model, reasoningPresetOverride: null },
    ]);
    expect(campaigns.setGenerationConfigurationOverride(campaign.id, null)).toEqual(campaign);
    expect(database.select().from(campaignGenerationConfigurationOverrideTable).all()).toEqual([]);
    expect(campaigns.get(campaign.id)).toEqual(campaign);
    expect(campaigns.listForScenario(campaign.scenarioId)).toEqual([campaign]);
  });

  it("rejects an incomplete campaign generation configuration override", () => {
    const { campaigns, scenarios } = openCampaigns(createDatabasePath());
    const campaign = campaigns.start(scenarios.create("Invalid configuration scenario").id);

    expect(() =>
      campaigns.setGenerationConfigurationOverride(campaign.id, {
        model: { ...modelSelection("invalid"), providerId: " " },
      }),
    ).toThrow(TypeError);
    expect(campaigns.get(campaign.id)).toEqual(campaign);
  });

  it("does not set a generation configuration override on an unknown campaign", () => {
    const { campaigns } = openCampaigns(createDatabasePath());

    expect(
      campaigns.setGenerationConfigurationOverride(
        ids.campaign.create(),
        generationConfiguration("unknown"),
      ),
    ).toBeNull();
  });

  it("rejects incomplete, blank, or invalid stored campaign configuration overrides", () => {
    const path = createDatabasePath();
    const { campaigns, database, scenarios } = openCampaigns(path);
    const campaign = campaigns.start(scenarios.create("Partial configuration scenario").id);
    closeDatabase(database);
    const client = new DatabaseSync(path);

    try {
      expect(() =>
        client
          .prepare(
            "INSERT INTO campaign_generation_configuration_overrides (campaign_id, provider_id, model_id, name) VALUES (?, ?, ?, ?)",
          )
          .run(campaign.id, "provider-a", "model-a", "Model A"),
      ).toThrow();
      expect(() =>
        client
          .prepare(
            "INSERT INTO campaign_generation_configuration_overrides (campaign_id, provider_id, model_id, name, brand_id) VALUES (?, ?, ?, ?, ?)",
          )
          .run(campaign.id, "provider-a", "model-a", " ", "brand-a"),
      ).toThrow();
      expect(() =>
        client
          .prepare(
            "INSERT INTO campaign_generation_configuration_overrides (campaign_id, provider_id, model_id, name, brand_id, reasoning_preset_override) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(campaign.id, "provider-a", "model-a", "Model A", "brand-a", "extreme"),
      ).toThrow();
    } finally {
      client.close();
    }
  });

  it("deletes a generation configuration override with its owning campaign", () => {
    const { campaigns, database, scenarios } = openCampaigns(createDatabasePath());
    const campaign = campaigns.start(scenarios.create("Owned configuration scenario").id);
    campaigns.setGenerationConfigurationOverride(campaign.id, generationConfiguration("owned"));

    database.delete(campaignTable).where(eq(campaignTable.id, campaign.id)).run();

    expect(database.select().from(campaignGenerationConfigurationOverrideTable).all()).toEqual([]);
  });
});
