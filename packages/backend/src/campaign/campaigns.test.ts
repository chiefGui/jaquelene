import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parsePromptKey } from "@jaquelene/domain";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import type { ReasoningPreset } from "#backend/model/reasoning";
import {
  jaqueleneNarratorPrompt,
  narratorPromptKind,
  narratorPromptModule,
} from "#backend/prompt/narrator";
import { createPrompts } from "#backend/prompt/prompts";
import { campaignPromptSelectionTable } from "#backend/prompt/schema";
import type { ModelSelection } from "#backend/provider/provider";
import { threadTable } from "#backend/thread/schema";
import { createThreads } from "#backend/thread/threads";
import { campaignPageSize, createCampaigns, type CampaignGenerationPreferences } from "./campaigns";
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
  const prompts = createPrompts(database, [narratorPromptModule]);
  return {
    database,
    campaigns: createCampaigns(database, now),
    prompts,
    threads: createThreads(database),
  };
}

function start(campaigns: ReturnType<typeof createCampaigns>, title: string) {
  return campaigns.start({ title, composition: [{ kind: narratorPromptKind.key }] });
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
  it("starts titled campaigns with threads and lists the newest first", () => {
    let startedAt = 100;
    const { campaigns, threads } = openCampaigns(createDatabasePath(), () => startedAt++);
    const first = start(campaigns, "  First campaign  ");
    const second = start(campaigns, "Second campaign");

    expect(first).toEqual({
      id: expect.stringMatching(/^campaign_/),
      title: "First campaign",
      threadId: expect.stringMatching(/^thread_/),
      startedAt: 100,
    });
    expect(threads.get(first.threadId)).toEqual({ id: first.threadId, createdAt: 100 });
    expect(campaigns.list().campaigns).toEqual([second, first]);
  });

  it("creates the campaign, thread, and explicit composition atomically", () => {
    const { campaigns, database, prompts } = openCampaigns(createDatabasePath());
    const custom = prompts.create({
      kind: narratorPromptKind.key,
      title: "Observer",
      body: "Describe only observable facts.",
    });
    const campaign = campaigns.start({
      title: "Observed",
      composition: [{ kind: narratorPromptKind.key, promptKey: custom.key }],
    });

    expect(database.select().from(campaignPromptSelectionTable).all()).toEqual([
      { campaignId: campaign.id, kind: narratorPromptKind.key, promptKey: custom.key },
    ]);

    expect(() =>
      campaigns.start({
        title: "Invalid",
        composition: [
          { kind: narratorPromptKind.key, promptKey: parsePromptKey(ids.prompt.create()) },
        ],
      }),
    ).toThrow(RangeError);
    expect(database.select().from(campaignTable).all()).toHaveLength(1);
    expect(database.select().from(threadTable).all()).toHaveLength(1);
  });

  it("distinguishes inherited composition from an explicit default selection", () => {
    const { campaigns, database } = openCampaigns(createDatabasePath());
    campaigns.start({
      title: "Inherited",
      composition: [{ kind: narratorPromptKind.key }],
    });
    const pinned = campaigns.start({
      title: "Pinned",
      composition: [{ kind: narratorPromptKind.key, promptKey: jaqueleneNarratorPrompt.key }],
    });
    expect(database.select().from(campaignPromptSelectionTable).all()).toEqual([
      {
        campaignId: pinned.id,
        kind: narratorPromptKind.key,
        promptKey: jaqueleneNarratorPrompt.key,
      },
    ]);
  });

  it("paginates campaigns with a stable cursor", () => {
    let startedAt = 1;
    const { campaigns, database } = openCampaigns(createDatabasePath(), () => startedAt++);
    const created = Array.from({ length: campaignPageSize + 1 }, (_, index) =>
      start(campaigns, `Campaign ${index}`),
    );
    const firstPage = campaigns.list();

    expect(firstPage.campaigns).toHaveLength(campaignPageSize);
    expect(firstPage.campaigns[0]).toEqual(created.at(-1));
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    database.delete(campaignTable).where(eq(campaignTable.id, created[1]!.id)).run();
    expect(campaigns.list({ cursor: firstPage.nextCursor! }).campaigns).toEqual([created[0]]);
  });

  it("persists, renames, and locates campaigns by their thread", () => {
    const path = createDatabasePath();
    const first = openCampaigns(path, () => 200);
    const campaign = start(first.campaigns, "Original");
    expect(first.campaigns.rename(campaign.id, "  Renamed  ")?.title).toBe("Renamed");
    closeDatabase(first.database);

    const second = openCampaigns(path);
    expect(second.campaigns.get(campaign.id)?.title).toBe("Renamed");
    expect(second.campaigns.getContextForThread(campaign.threadId)).toEqual({ id: campaign.id });
  });

  it("enforces campaign identity and title constraints in SQLite", () => {
    const path = createDatabasePath();
    const { database, threads } = openCampaigns(path);
    const thread = threads.create();
    closeDatabase(database);
    const client = new DatabaseSync(path);

    try {
      const insert = client.prepare(
        "INSERT INTO campaigns (id, title, thread_id, started_at) VALUES (?, ?, ?, ?)",
      );
      expect(() => insert.run(null, "Title", thread.id, 300)).toThrow();
      expect(() => insert.run(ids.campaign.create(), " ", thread.id, 300)).toThrow();
    } finally {
      client.close();
    }
  });

  it("sets, replaces, and clears generation preferences", () => {
    const { campaigns, database } = openCampaigns(createDatabasePath());
    const campaign = start(campaigns, "Generation preferences");
    const preferences = generationPreferences("selected", "high");
    const replacement = generationPreferences(undefined, "low");

    expect(campaigns.setGenerationPreferences(campaign.id, preferences)).toEqual({
      ...campaign,
      generationPreferences: preferences,
    });
    expect(database.select().from(campaignGenerationPreferencesTable).all()).toEqual([
      { campaignId: campaign.id, ...preferences.model, reasoningPreset: "high" },
    ]);
    expect(campaigns.setGenerationPreferences(campaign.id, replacement)).toEqual({
      ...campaign,
      generationPreferences: replacement,
    });
    expect(campaigns.setGenerationPreferences(campaign.id, null)).toEqual(campaign);
    expect(database.select().from(campaignGenerationPreferencesTable).all()).toEqual([]);
  });

  it("rejects invalid generation preferences without changing the campaign", () => {
    const { campaigns } = openCampaigns(createDatabasePath());
    const campaign = start(campaigns, "Invalid preferences");

    expect(() =>
      campaigns.setGenerationPreferences(campaign.id, {
        model: { ...modelSelection("invalid"), providerId: " " },
      }),
    ).toThrow(TypeError);
    expect(() => campaigns.setGenerationPreferences(campaign.id, {})).toThrow(TypeError);
    expect(campaigns.get(campaign.id)).toEqual(campaign);
  });

  it("cascades owned preferences when a campaign is deleted", () => {
    const { campaigns, database } = openCampaigns(createDatabasePath());
    const campaign = start(campaigns, "Owned preferences");
    campaigns.setGenerationPreferences(campaign.id, generationPreferences("owned"));
    database.delete(campaignTable).where(eq(campaignTable.id, campaign.id)).run();
    expect(database.select().from(campaignGenerationPreferencesTable).all()).toEqual([]);
  });
});
