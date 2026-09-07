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
});
