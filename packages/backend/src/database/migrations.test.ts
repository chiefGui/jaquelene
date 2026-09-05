import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vite-plus/test";
import { databaseMigrationsDirectory } from "./migrations";

describe("database migrations", () => {
  it("contains one fresh baseline with the current content model", () => {
    const migrations = readdirSync(databaseMigrationsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(migrations).toHaveLength(1);
    const migration = migrations[0];

    if (!migration) {
      throw new Error("The database baseline is missing.");
    }

    const client = new DatabaseSync(":memory:");

    try {
      client.exec("PRAGMA foreign_keys = ON;");
      const sql = readFileSync(
        join(databaseMigrationsDirectory, migration, "migration.sql"),
        "utf8",
      );

      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim().length > 0) {
          client.exec(statement);
        }
      }

      const tables = client
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map(({ name }) => name);
      expect(tables).toContain("campaigns");
      expect(tables).toContain("skills");
      expect(tables).toContain("campaign_skill_selections");
      expect(tables).not.toContain("prompts");
      expect(tables).not.toContain("campaign_prompt_selections");
      expect(tables).not.toContain("scenarios");
      expect(tables).not.toContain("roleplay_instructions");

      const skillColumns = client
        .prepare("PRAGMA table_info(skills)")
        .all()
        .map(({ name }) => name);
      expect(skillColumns).toContain("prompt");
      expect(skillColumns).not.toContain("body");

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
