import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parsePromptKey } from "@jaquelene/domain";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import { ids } from "#backend/id";
import type { ReasoningPreset } from "#backend/model/reasoning";
import {
  jaqueleneNarratorPromptDefinition,
  narratorPromptKind,
  narratorPromptModule,
} from "#backend/narrator/module";
import { createPrompts } from "#backend/prompt/prompts";
import { campaignPromptSelectionTable } from "#backend/prompt/schema";
import type { ModelSelection } from "#backend/provider/provider";
import { threadMessageTable, threadTable, turnTable } from "#backend/thread/schema";
import { createThreads } from "#backend/thread/threads";
import { providerAttemptTable } from "#backend/usage/schema";
import {
  campaignPageSize,
  createCampaigns,
  type Campaign,
  type CampaignGenerationPreferences,
  type CampaignSummary,
} from "./campaigns";
import { campaignGenerationPreferencesTable, campaignTable } from "./schema";

const directories: string[] = [];
const databases: Database[] = [];

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-campaigns-"));
  directories.push(directory);
  return join(directory, "jaquelene.sqlite");
}

function openCampaigns(path: string, now?: () => number, threadNow?: () => number) {
  const database = openDatabase(path);
  databases.push(database);
  const prompts = createPrompts(database, [narratorPromptModule]);
  return {
    database,
    campaigns: createCampaigns(database, now),
    prompts,
    threads: createThreads(database, threadNow),
  };
}

function start(campaigns: ReturnType<typeof createCampaigns>, title: string) {
  return campaigns.start({ title, composition: [{ kind: narratorPromptKind.key }] });
}

function summary(campaign: Campaign, lastActivityAt = campaign.lastActivityAt): CampaignSummary {
  return {
    id: campaign.id,
    title: campaign.title,
    threadId: campaign.threadId,
    lastActivityAt,
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
      lastActivityAt: 100,
      turnCount: 0,
    });
    expect(threads.get(first.threadId)).toEqual({ id: first.threadId, createdAt: 100 });
    expect(campaigns.list().campaigns).toEqual([summary(second), summary(first)]);
  });

  it("orders campaign summaries by active conversation activity", () => {
    let startedAt = 100;
    let messageAt = 300;
    const { campaigns, threads } = openCampaigns(
      createDatabasePath(),
      () => startedAt++,
      () => messageAt++,
    );
    const first = start(campaigns, "First campaign");
    const second = start(campaigns, "Second campaign");
    const activity = threads.startTurn(first.threadId, "Bring this campaign forward");

    expect(campaigns.list().campaigns).toEqual([
      summary(first, activity.message.createdAt),
      summary(second),
    ]);
    expect(campaigns.get(first.id)).toEqual({
      ...first,
      lastActivityAt: activity.message.createdAt,
      turnCount: 1,
    });
  });

  it("uses the activity index for the bounded sidebar read", () => {
    const { campaigns, database } = openCampaigns(createDatabasePath(), () => 400);
    start(campaigns, "Indexed campaign");

    const queries = [
      `
        EXPLAIN QUERY PLAN
        SELECT campaigns.id
        FROM threads
        INNER JOIN campaigns ON campaigns.thread_id = threads.id
        ORDER BY threads.last_activity_at DESC, threads.id DESC
        LIMIT 51
      `,
      `
        EXPLAIN QUERY PLAN
        SELECT campaigns.id
        FROM threads
        INNER JOIN campaigns ON campaigns.thread_id = threads.id
        WHERE threads.last_activity_at < 500
          OR (threads.last_activity_at = 500 AND threads.id < 'thread_z')
        ORDER BY threads.last_activity_at DESC, threads.id DESC
        LIMIT 51
      `,
    ];

    for (const query of queries) {
      const plan = database.$client
        .prepare(query)
        .all()
        .map((row) => String(row.detail))
        .join("\n");

      expect(plan).toContain("threads_last_activity_at_index");
      expect(plan).not.toContain("USE TEMP B-TREE");
    }
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
      composition: [
        { kind: narratorPromptKind.key, promptKey: jaqueleneNarratorPromptDefinition.key },
      ],
    });
    expect(database.select().from(campaignPromptSelectionTable).all()).toEqual([
      {
        campaignId: pinned.id,
        kind: narratorPromptKind.key,
        promptKey: jaqueleneNarratorPromptDefinition.key,
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
    expect(firstPage.campaigns[0]).toEqual(summary(created.at(-1)!));
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    database.delete(campaignTable).where(eq(campaignTable.id, created[1]!.id)).run();
    expect(campaigns.list({ cursor: firstPage.nextCursor! }).campaigns).toEqual([
      summary(created[0]!),
    ]);
  });

  it("persists, renames, and locates campaigns by their thread", () => {
    const path = createDatabasePath();
    const first = openCampaigns(path, () => 200);
    const campaign = start(first.campaigns, "Original");
    const activity = first.threads.startTurn(campaign.threadId, "Remember this turn");
    const renamed = {
      ...campaign,
      title: "Renamed",
      lastActivityAt: activity.message.createdAt,
      turnCount: 1,
    };
    expect(first.campaigns.rename(campaign.id, "  Renamed  ")).toEqual(renamed);
    closeDatabase(first.database);

    const second = openCampaigns(path);
    expect(second.campaigns.get(campaign.id)).toEqual(renamed);
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

  it("hard-deletes campaign content while preserving usage history", () => {
    const { campaigns, database, prompts, threads } = openCampaigns(createDatabasePath());
    const customPrompt = prompts.create({
      kind: narratorPromptKind.key,
      title: "Observer",
      body: "Describe only observable facts.",
    });
    const campaign = campaigns.start({
      title: "Owned content",
      composition: [{ kind: narratorPromptKind.key, promptKey: customPrompt.key }],
    });
    campaigns.setGenerationPreferences(campaign.id, generationPreferences("owned", "high"));
    const { turn } = threads.startTurn(campaign.threadId, "Begin the story.");
    const generationId = ids.generation.create();
    database
      .insert(generationTable)
      .values({
        id: generationId,
        turnId: turn.id,
        intent: "reply",
        providerId: "provider-a",
        modelId: "model-a",
        status: "failed",
        failureKind: "provider",
        startedAt: turn.createdAt,
        finishedAt: turn.createdAt,
      })
      .run();
    const attempt = {
      id: ids.providerAttempt.create(),
      executionId: generationId,
      attributionKind: "campaign",
      attributionId: campaign.id,
      providerId: "provider-a",
      requestedModelId: "model-a",
      status: "completed" as const,
      startedAt: turn.createdAt,
      finishedAt: turn.createdAt,
    };
    database.insert(providerAttemptTable).values(attempt).run();
    const unrelated = start(campaigns, "Unrelated campaign");

    expect(campaigns.delete(campaign.id)).toEqual({
      id: campaign.id,
      threadId: campaign.threadId,
    });

    expect(campaigns.get(campaign.id)).toBeNull();
    expect(threads.get(campaign.threadId)).toBeNull();
    expect(database.select().from(campaignTable).all()).toEqual([
      {
        id: unrelated.id,
        title: unrelated.title,
        threadId: unrelated.threadId,
        startedAt: unrelated.startedAt,
      },
    ]);
    expect(database.select().from(campaignGenerationPreferencesTable).all()).toEqual([]);
    expect(database.select().from(campaignPromptSelectionTable).all()).toEqual([]);
    expect(database.select().from(generationTable).all()).toEqual([]);
    expect(database.select().from(threadMessageTable).all()).toEqual([]);
    expect(database.select().from(turnTable).all()).toEqual([]);
    expect(database.select().from(threadTable).all()).toEqual([
      {
        id: unrelated.threadId,
        createdAt: unrelated.startedAt,
        lastActivityAt: unrelated.lastActivityAt,
        turnCount: unrelated.turnCount,
        lastMessageSequence: 0,
        activeMessageId: null,
      },
    ]);
    expect(database.select().from(providerAttemptTable).all()).toEqual([
      expect.objectContaining(attempt),
    ]);
    expect(campaigns.delete(campaign.id)).toBeNull();
  });

  it("preserves a campaign while its reply is pending", () => {
    const { campaigns, database, threads } = openCampaigns(createDatabasePath());
    const campaign = start(campaigns, "Active campaign");
    const { turn, activity } = threads.startTurn(campaign.threadId, "Begin the story.");
    database
      .insert(generationTable)
      .values({
        id: ids.generation.create(),
        turnId: turn.id,
        intent: "reply",
        providerId: "provider-a",
        modelId: "model-a",
        status: "pending",
        startedAt: turn.createdAt,
      })
      .run();

    expect(() => campaigns.delete(campaign.id)).toThrow(
      "Campaign cannot be deleted while a reply is being generated.",
    );
    expect(campaigns.get(campaign.id)).toEqual({
      ...campaign,
      lastActivityAt: activity.lastActivityAt,
      turnCount: activity.turnCount,
    });
    expect(threads.get(campaign.threadId)).toEqual({
      id: campaign.threadId,
      createdAt: campaign.startedAt,
    });
  });

  it("rolls back the campaign deletion when its thread cannot be deleted", () => {
    const { campaigns, database } = openCampaigns(createDatabasePath());
    const campaign = start(campaigns, "Atomic deletion");
    campaigns.setGenerationPreferences(campaign.id, generationPreferences("owned"));
    database.$client.exec(`
      CREATE TRIGGER reject_campaign_thread_delete
      BEFORE DELETE ON threads
      WHEN OLD.id = '${campaign.threadId}'
      BEGIN
        SELECT RAISE(ABORT, 'Rejected thread deletion');
      END;
    `);

    expect(() => campaigns.delete(campaign.id)).toThrow('Failed query: delete from "threads"');
    expect(campaigns.get(campaign.id)).toEqual({
      ...campaign,
      generationPreferences: generationPreferences("owned"),
    });
    expect(database.select().from(campaignGenerationPreferencesTable).all()).toHaveLength(1);
    expect(database.select().from(threadTable).all()).toHaveLength(1);
  });
});
