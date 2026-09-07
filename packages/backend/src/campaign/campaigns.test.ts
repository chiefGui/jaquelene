import { openingScenePromptModule } from "#backend/opening-scene/module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CAMPAIGN_SCENARIO_MAX_LENGTH,
  CAMPAIGN_OPENING_SCENE_MAX_LENGTH,
  openingScenePromptKindKey,
  parsePromptKey,
} from "@jaquelene/domain";
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
  it("atomically starts with exact opening narration and persists it without a generation or player turn", () => {
    const path = createDatabasePath();
    const first = openCampaigns(path);
    const openingScene = "    John wakes up.\n\nSomeone knocks. ??\n";
    const campaign = first.campaigns.start({ title: "Morning", openingScene, composition: [] });
    const messages = first.threads.listMessages({
      threadId: campaign.threadId,
      direction: "older",
    }).messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      content: openingScene,
      author: "assistant",
      turnId: null,
      parentMessageId: null,
      sequence: 1,
    });
    expect(campaign.turnCount).toBe(0);
    expect(first.database.select().from(turnTable).all()).toEqual([]);
    expect(first.database.select().from(generationTable).all()).toEqual([]);
    const second = openCampaigns(path);
    expect(
      second.threads.listMessages({ threadId: campaign.threadId, direction: "older" }).messages,
    ).toEqual(messages);
    expect(second.campaigns.get(campaign.id)).toEqual(campaign);
    expect(first.campaigns.delete(campaign.id)).toEqual({
      id: campaign.id,
      threadId: campaign.threadId,
    });
    expect(first.database.select().from(threadMessageTable).all()).toEqual([]);
  });

  it.each([undefined, "", " \t\n\u2003"])(
    "leaves the conversation empty for blank opening %j",
    (openingScene) => {
      const { campaigns, threads } = openCampaigns(createDatabasePath());
      const campaign = campaigns.start({
        title: "Morning",
        ...(openingScene !== undefined && { openingScene }),
        composition: [],
      });
      expect(
        threads.listMessages({ threadId: campaign.threadId, direction: "older" }).messages,
      ).toEqual([]);
    },
  );

  it("copies saved openings independently of later library edits, deletion, and reopening", () => {
    const path = createDatabasePath();
    const first = openCampaigns(path);
    const prompts = createPrompts(first.database, [narratorPromptModule, openingScenePromptModule]);
    const opening = prompts.create({
      kind: openingScenePromptKindKey,
      title: "Morning",
      body: "  Someone knocks.\n",
    });
    const campaign = first.campaigns.start({
      title: "Morning",
      openingScene: opening.body,
      composition: [],
    });
    prompts.update(opening.key, { title: "Night", body: "A phone rings." });
    prompts.setDefault(openingScenePromptKindKey, opening.key);
    prompts.delete(opening.key);
    expect(prompts.getDefault(openingScenePromptKindKey).promptKey).toBeNull();
    closeDatabase(first.database);
    const second = openCampaigns(path);
    const messages = second.threads.listMessages({
      threadId: campaign.threadId,
      direction: "older",
    }).messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ author: "assistant", turnId: null, content: opening.body });
    expect(second.database.select().from(generationTable).all()).toEqual([]);
  });

  it.each(["a", "\u{1f319}"])(
    "enforces the 20,000-character opening limit for %s before creating campaign state",
    (character) => {
      const { campaigns, database, threads } = openCampaigns(createDatabasePath());
      expect(() =>
        campaigns.start({
          title: "Too long",
          openingScene: character.repeat(CAMPAIGN_OPENING_SCENE_MAX_LENGTH + 1),
          composition: [],
        }),
      ).toThrow(TypeError);
      expect(database.select().from(campaignTable).all()).toEqual([]);
      expect(database.select().from(threadTable).all()).toEqual([]);
      const openingScene = character.repeat(CAMPAIGN_OPENING_SCENE_MAX_LENGTH);
      const campaign = campaigns.start({ title: "At limit", openingScene, composition: [] });
      expect(
        threads.listMessages({ threadId: campaign.threadId, direction: "older" }).messages[0]
          ?.content,
      ).toBe(openingScene);
    },
  );

  it("rolls back campaign creation if storing its opening fails", () => {
    const { database, campaigns } = openCampaigns(createDatabasePath());
    database.$client.exec(
      "CREATE TRIGGER reject_opening BEFORE INSERT ON thread_messages BEGIN SELECT RAISE(ABORT, 'No space'); END;",
    );
    expect(() =>
      campaigns.start({ title: "Morning", openingScene: "John wakes up.", composition: [] }),
    ).toThrow();
    expect(database.select().from(campaignTable).all()).toEqual([]);
    expect(database.select().from(threadTable).all()).toEqual([]);
  });

  it("persists campaign-owned scenarios and supports replacing and clearing them", () => {
    const path = createDatabasePath();
    const first = openCampaigns(path);
    const scenario = "    A hidden city.\n\nMagic has a price.\n";
    const campaign = first.campaigns.start({ title: "A city", scenario, composition: [] });
    const independent = first.campaigns.start({ title: "Another city", scenario, composition: [] });
    closeDatabase(first.database);
    const second = openCampaigns(path);

    expect(second.campaigns.get(campaign.id)?.scenario).toBe(scenario);
    expect(second.campaigns.getContextForThread(campaign.threadId)).toEqual({
      id: campaign.id,
      instructions: [
        { sourceKey: `campaign.${campaign.id}.scenario`, content: `## Scenario\n${scenario}` },
      ],
    });
    expect(second.campaigns.setScenario(campaign.id, "A floating city.")?.scenario).toBe(
      "A floating city.",
    );
    expect(second.campaigns.get(independent.id)?.scenario).toBe(scenario);
    expect(second.campaigns.setScenario(campaign.id, " \n\t")?.scenario).toBe("");
    expect(second.campaigns.get(campaign.id)?.scenario).toBe("");
    expect(second.campaigns.setScenario(ids.campaign.create(), "Missing")).toBeNull();
  });

  it("rejects invalid scenarios without writing campaign or thread state", () => {
    const { campaigns, database } = openCampaigns(createDatabasePath());
    const tooLong = "x".repeat(CAMPAIGN_SCENARIO_MAX_LENGTH + 1);
    expect(() => campaigns.start({ title: "Invalid", scenario: tooLong, composition: [] })).toThrow(
      TypeError,
    );
    expect(database.select().from(campaignTable).all()).toEqual([]);
    expect(database.select().from(threadTable).all()).toEqual([]);

    const campaign = campaigns.start({ title: "Valid", scenario: "A desert", composition: [] });
    expect(() => campaigns.setScenario(campaign.id, tooLong)).toThrow(TypeError);
    expect(campaigns.get(campaign.id)?.scenario).toBe("A desert");
    expect(() => database.update(campaignTable).set({ scenario: tooLong }).run()).toThrow();
    expect(() => database.update(campaignTable).set({ scenario: " \n\t" }).run()).toThrow();
  });

  it("treats omitted and whitespace-only scenarios as absent", () => {
    const { campaigns } = openCampaigns(createDatabasePath());
    expect(start(campaigns, "No scenario").scenario).toBe("");
    expect(campaigns.start({ title: "Blank", scenario: "\n \t", composition: [] }).scenario).toBe(
      "",
    );
  });

  it("starts titled campaigns with threads and lists the newest first", () => {
    let startedAt = 100;
    const { campaigns, threads } = openCampaigns(createDatabasePath(), () => startedAt++);
    const first = start(campaigns, "  First campaign  ");
    const second = start(campaigns, "Second campaign");

    expect(first).toEqual({
      id: expect.stringMatching(/^campaign_/),
      title: "First campaign",
      scenario: "",
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
    expect(second.campaigns.getContextForThread(campaign.threadId)).toEqual({
      id: campaign.id,
      instructions: [],
    });
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
        threadId: turn.threadId,
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
        scenario: unrelated.scenario,
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
        threadId: turn.threadId,
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
