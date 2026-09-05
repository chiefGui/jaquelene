import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Result } from "effect";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createCampaigns } from "#backend/campaign/campaigns";
import { campaignTable } from "#backend/campaign/schema";
import {
  DatabaseService,
  closeDatabase,
  openDatabase,
  type Database,
} from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import { ids } from "#backend/id";
import { narratorSkillKind, narratorSkillRegistration } from "#backend/narrator/module";
import { createSkills } from "#backend/skill/skills";
import { skillTable } from "#backend/skill/schema";
import { threadMessageTable, threadTable, turnTable } from "#backend/thread/schema";
import { createThreads } from "#backend/thread/threads";
import { providerAttemptTable } from "#backend/usage/schema";
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
    const skills = createSkills(database, [narratorSkillRegistration]);
    const campaign = createCampaigns(database).start({ title: "The Long Night", composition: [] });
    skills.create({ kind: narratorSkillKind.key, title: "Noir", prompt: "Keep it dark." });
    const { turn } = createThreads(database).startTurn(campaign.threadId, "Begin the story.");
    database
      .insert(providerAttemptTable)
      .values({
        id: ids.providerAttempt.create(),
        executionId: ids.generation.create(),
        attributionKind: "campaign",
        attributionId: campaign.id,
        providerId: "provider-a",
        requestedModelId: "model-a",
        status: "completed",
        startedAt: turn.createdAt,
        finishedAt: turn.createdAt,
      })
      .run();
    const deletion = createContentStorageArea(path).delete.pipe(
      Effect.provideService(DatabaseService, database),
    );

    await Effect.runPromise(deletion);

    expect(database.select().from(generationTable).all()).toEqual([]);
    expect(database.select().from(providerAttemptTable).all()).toEqual([]);
    expect(database.select().from(campaignTable).all()).toEqual([]);
    expect(database.select().from(skillTable).all()).toHaveLength(1);
    expect(database.select().from(threadMessageTable).all()).toEqual([]);
    expect(database.select().from(turnTable).all()).toEqual([]);
    expect(database.select().from(threadTable).all()).toEqual([]);
    await expect(Effect.runPromise(deletion)).resolves.toBeUndefined();
  });

  it("preserves content while a reply is being generated", () => {
    const { database, path } = createTestDatabase();
    const skills = createSkills(database, [narratorSkillRegistration]);
    const campaign = createCampaigns(database).start({ title: "The Long Night", composition: [] });
    skills.create({ kind: narratorSkillKind.key, title: "Noir", prompt: "Keep it dark." });
    const { turn } = createThreads(database).startTurn(campaign.threadId, "Begin the story.");
    database
      .insert(generationTable)
      .values({
        id: ids.generation.create(),
        turnId: turn.id,
        intent: "reply",
        providerId: "provider-a",
        modelId: "model-a",
        status: "pending",
        startedAt: 0,
      })
      .run();
    const deletion = createContentStorageArea(path).delete.pipe(
      Effect.provideService(DatabaseService, database),
    );

    expect(Effect.runSync(Effect.result(deletion))).toEqual(
      Result.fail(
        expect.objectContaining({
          _tag: "StorageAreaDeleteError",
          areaId: "content",
          cause: expect.objectContaining({
            message: "Content cannot be deleted while a reply is being generated.",
          }),
        }),
      ),
    );
    expect(database.select().from(campaignTable).all()).toHaveLength(1);
    expect(database.select().from(skillTable).all()).toHaveLength(2);
    expect(database.select().from(threadTable).all()).toHaveLength(1);
    expect(database.select().from(generationTable).all()).toHaveLength(1);
  });

  it("preserves content while an independent provider attempt is active", () => {
    const { database, path } = createTestDatabase();
    createSkills(database, [narratorSkillRegistration]);
    const campaign = createCampaigns(database).start({ title: "The Long Night", composition: [] });
    createThreads(database).startTurn(campaign.threadId, "Begin the story.");
    database
      .insert(providerAttemptTable)
      .values({
        id: ids.providerAttempt.create(),
        executionId: "independent-execution",
        providerId: "provider-a",
        requestedModelId: "model-a",
        status: "pending",
        startedAt: 0,
      })
      .run();
    const deletion = createContentStorageArea(path).delete.pipe(
      Effect.provideService(DatabaseService, database),
    );

    expect(Effect.runSync(Effect.result(deletion))).toEqual(
      Result.fail(
        expect.objectContaining({
          _tag: "StorageAreaDeleteError",
          areaId: "content",
          cause: expect.objectContaining({
            message: expect.stringContaining("provider attempt is active"),
          }),
        }),
      ),
    );
    expect(database.select().from(providerAttemptTable).all()).toHaveLength(1);
    expect(database.select().from(campaignTable).all()).toHaveLength(1);
  });

  it("rolls back every content deletion when an owner operation fails", () => {
    const { database, path } = createTestDatabase();
    createSkills(database, [narratorSkillRegistration]);
    const campaign = createCampaigns(database).start({ title: "The Long Night", composition: [] });
    createThreads(database).startTurn(campaign.threadId, "Begin the story.");
    database
      .insert(providerAttemptTable)
      .values({
        id: ids.providerAttempt.create(),
        executionId: ids.generation.create(),
        attributionKind: "campaign",
        attributionId: campaign.id,
        providerId: "provider-a",
        requestedModelId: "model-a",
        status: "completed",
        startedAt: 0,
        finishedAt: 1,
      })
      .run();
    database.$client.exec(`
      CREATE TRIGGER reject_thread_delete
      BEFORE DELETE ON threads
      BEGIN
        SELECT RAISE(ABORT, 'Rejected thread deletion');
      END;
    `);
    const deletion = createContentStorageArea(path).delete.pipe(
      Effect.provideService(DatabaseService, database),
    );

    expect(Effect.runSync(Effect.result(deletion))).toEqual(
      Result.fail(
        expect.objectContaining({
          _tag: "StorageAreaDeleteError",
          areaId: "content",
          cause: expect.objectContaining({
            message: expect.stringContaining('Failed query: delete from "threads"'),
          }),
        }),
      ),
    );
    expect(database.select().from(campaignTable).all()).toHaveLength(1);
    expect(database.select().from(threadTable).all()).toHaveLength(1);
    expect(database.select().from(turnTable).all()).toHaveLength(1);
    expect(database.select().from(threadMessageTable).all()).toHaveLength(1);
    expect(database.select().from(providerAttemptTable).all()).toHaveLength(1);
  });
});
