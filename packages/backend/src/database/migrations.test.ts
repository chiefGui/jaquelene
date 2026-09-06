import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vite-plus/test";
import { databaseMigrationsDirectory } from "./migrations";

function migrationNames() {
  return readdirSync(databaseMigrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function applyMigration(client: DatabaseSync, migration: string) {
  const sql = readFileSync(join(databaseMigrationsDirectory, migration, "migration.sql"), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim().length > 0) {
      client.exec(statement);
    }
  }
}

describe("database migrations", () => {
  it("creates the current content model from its migrations", () => {
    const migrations = migrationNames();
    expect(migrations.length).toBeGreaterThan(0);
    const client = new DatabaseSync(":memory:");

    try {
      client.exec("PRAGMA foreign_keys = ON;");
      for (const migration of migrations) {
        applyMigration(client, migration);
      }

      const tables = client
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map(({ name }) => name);
      expect(tables).toContain("campaigns");
      expect(tables).toContain("prompts");
      expect(tables).toContain("campaign_prompt_selections");
      expect(tables).not.toContain("scenarios");
      expect(tables).not.toContain("roleplay_instructions");

      const campaignColumns = client.prepare("PRAGMA table_info(campaigns)").all();
      expect(campaignColumns).toContainEqual(
        expect.objectContaining({ name: "scenario", type: "TEXT", notnull: 1, dflt_value: "''" }),
      );

      const attemptColumns = client
        .prepare("PRAGMA table_info(provider_attempts)")
        .all()
        .map(({ name }) => name);
      expect(attemptColumns).toEqual(
        expect.arrayContaining(["execution_id", "attribution_kind", "attribution_id"]),
      );
      expect(attemptColumns).not.toContain("generation_id");
      expect(attemptColumns).not.toContain("thread_id");
      expect(attemptColumns).not.toContain("campaign_id");
    } finally {
      client.close();
    }
  });

  it("preserves existing conversation and generation records when adding regeneration guidance", () => {
    const client = new DatabaseSync(":memory:");
    const [baseline, ...updates] = migrationNames();
    if (baseline === undefined) {
      throw new Error("The database baseline is missing.");
    }
    try {
      client.exec("PRAGMA foreign_keys = ON;");
      applyMigration(client, baseline);
      client.exec(`
        INSERT INTO threads(id, created_at, last_activity_at) VALUES ('thread', 1, 1);
        INSERT INTO turns(id, thread_id, created_at) VALUES ('turn', 'thread', 1);
        INSERT INTO thread_messages(id, thread_id, turn_id, sequence, author, content, created_at)
          VALUES ('user', 'thread', 'turn', 1, 'user', 'Hello', 1);
        INSERT INTO thread_messages(id, thread_id, turn_id, parent_message_id, sequence, author, content, created_at)
          VALUES ('assistant', 'thread', 'turn', 'user', 2, 'assistant', 'Hi', 2);
        INSERT INTO generations(id, turn_id, provider_id, model_id, intent, status, output_message_id, started_at, finished_at)
          VALUES ('original', 'turn', 'provider', 'model', 'reply', 'completed', 'assistant', 1, 2);
        UPDATE threads SET active_message_id = 'assistant' WHERE id = 'thread';
      `);
      const original = client.prepare("SELECT * FROM generations").get();
      // The application migrator runs the upgrade inside a transaction.
      client.exec("BEGIN");
      for (const migration of updates) {
        applyMigration(client, migration);
      }
      client.exec("COMMIT");
      expect(client.prepare("SELECT * FROM generations").get()).toEqual({
        ...original,
        regeneration_source_message_id: null,
        regeneration_instructions: null,
      });
      expect(client.prepare("SELECT content FROM thread_messages ORDER BY sequence").all()).toEqual(
        [{ content: "Hello" }, { content: "Hi" }],
      );
      expect(client.prepare("SELECT active_message_id FROM threads").get()).toEqual({
        active_message_id: "assistant",
      });
      expect(client.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(client.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
      client.exec(`INSERT INTO generations(id, turn_id, provider_id, model_id, intent, status, regeneration_source_message_id, regeneration_instructions, started_at)
        VALUES ('guided', 'turn', 'provider', 'model', 'regeneration', 'pending', 'assistant', 'Shorter.', 3)`);
      expect(() =>
        client.exec(
          "UPDATE generations SET regeneration_source_message_id = 'missing' WHERE id = 'guided'",
        ),
      ).toThrow();
      expect(() =>
        client.exec("UPDATE generations SET regeneration_instructions = NULL WHERE id = 'guided'"),
      ).toThrow();
      const updateInstructions = client.prepare(
        "UPDATE generations SET regeneration_instructions = ? WHERE id = 'guided'",
      );
      expect(() => updateInstructions.run("a".repeat(2_000))).not.toThrow();
      expect(() => updateInstructions.run("a".repeat(2_001))).toThrow();
    } finally {
      client.close();
    }
  });
});
