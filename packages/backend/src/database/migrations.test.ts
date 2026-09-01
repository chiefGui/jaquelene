import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vite-plus/test";
import { databaseMigrationsDirectory } from "./migrations";

const durableUsageMigration = "20260901195506_durable_usage_history";

function applyMigration(client: DatabaseSync, directory: string) {
  const migration = readFileSync(
    join(databaseMigrationsDirectory, directory, "migration.sql"),
    "utf8",
  );

  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim().length > 0) {
      client.exec(statement);
    }
  }
}

describe("database migrations", () => {
  it("moves existing generation accounting into durable provider attempts", () => {
    const client = new DatabaseSync(":memory:");

    try {
      client.exec("PRAGMA foreign_keys = ON;");

      const migrations = readdirSync(databaseMigrationsDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      const durableUsageMigrationIndex = migrations.indexOf(durableUsageMigration);

      expect(durableUsageMigrationIndex).toBeGreaterThan(0);

      for (const migration of migrations.slice(0, durableUsageMigrationIndex)) {
        applyMigration(client, migration);
      }

      const generationId = "generation_01k46w4v06f7vs6qdqb8r78x8w";
      const invalidOutputGenerationId = "generation_01k46w4v06f7vs6qdqb8r78x8x";
      client
        .prepare("INSERT INTO scenarios (id, title) VALUES (?, ?)")
        .run("scenario_01k46w4v06f7vs6qdqb8r78x8w", "The Long Night");
      client
        .prepare("INSERT INTO threads (id, created_at) VALUES (?, ?)")
        .run("thread_01k46w4v06f7vs6qdqb8r78x8w", 1_725_168_600_000);
      client
        .prepare(
          "INSERT INTO campaigns (id, scenario_id, thread_id, started_at) VALUES (?, ?, ?, ?)",
        )
        .run(
          "campaign_01k46w4v06f7vs6qdqb8r78x8w",
          "scenario_01k46w4v06f7vs6qdqb8r78x8w",
          "thread_01k46w4v06f7vs6qdqb8r78x8w",
          1_725_168_600_000,
        );
      client
        .prepare("INSERT INTO turns (id, thread_id, created_at) VALUES (?, ?, ?)")
        .run(
          "turn_01k46w4v06f7vs6qdqb8r78x8w",
          "thread_01k46w4v06f7vs6qdqb8r78x8w",
          1_725_168_600_000,
        );
      const insertGeneration = client.prepare(
        `INSERT INTO generations (
            id, turn_id, provider_id, model_id, status, failure_kind,
            provider_generation_id, resolved_model_id, upstream_provider_id, finish_reason,
            input_tokens, cache_read_input_tokens, cache_write_input_tokens,
            output_tokens, reasoning_output_tokens, total_tokens,
            cost_currency, cost_amount_nanos, cost_source,
            started_at, provider_started_at, finished_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      insertGeneration.run(
        generationId,
        "turn_01k46w4v06f7vs6qdqb8r78x8w",
        "openrouter",
        "requested/model",
        "failed",
        "provider",
        "provider-response-id",
        "resolved/model",
        "upstream-provider",
        "length",
        120,
        20,
        5,
        30,
        10,
        150,
        "USD",
        12_345,
        "provider-reported",
        1_725_168_600_000,
        1_725_168_600_100,
        1_725_168_600_500,
      );
      insertGeneration.run(
        invalidOutputGenerationId,
        "turn_01k46w4v06f7vs6qdqb8r78x8w",
        "openrouter",
        "requested/model",
        "failed",
        "invalid-output",
        "invalid-output-response-id",
        null,
        null,
        null,
        7,
        null,
        null,
        2,
        null,
        9,
        null,
        null,
        null,
        1_725_168_601_000,
        1_725_168_601_100,
        1_725_168_601_500,
      );

      applyMigration(client, durableUsageMigration);

      expect(
        client.prepare("SELECT * FROM provider_attempts WHERE generation_id = ?").get(generationId),
      ).toMatchObject({
        id: "attempt_01k46w4v06f7vs6qdqb8r78x8w",
        generation_id: generationId,
        thread_id: "thread_01k46w4v06f7vs6qdqb8r78x8w",
        campaign_id: "campaign_01k46w4v06f7vs6qdqb8r78x8w",
        provider_id: "openrouter",
        requested_model_id: "requested/model",
        status: "failed",
        failure_kind: "provider",
        provider_generation_id: "provider-response-id",
        resolved_model_id: "resolved/model",
        upstream_provider_id: "upstream-provider",
        finish_reason: "length",
        input_tokens: 120,
        cache_read_input_tokens: 20,
        cache_write_input_tokens: 5,
        output_tokens: 30,
        reasoning_output_tokens: 10,
        total_tokens: 150,
        cost_currency: "USD",
        cost_amount_nanos: 12_345,
        cost_source: "provider-reported",
        started_at: 1_725_168_600_100,
        finished_at: 1_725_168_600_500,
      });
      expect(
        client
          .prepare("SELECT * FROM provider_attempts WHERE generation_id = ?")
          .get(invalidOutputGenerationId),
      ).toMatchObject({
        id: "attempt_01k46w4v06f7vs6qdqb8r78x8x",
        generation_id: invalidOutputGenerationId,
        status: "completed",
        failure_kind: null,
        provider_generation_id: "invalid-output-response-id",
        input_tokens: 7,
        output_tokens: 2,
        total_tokens: 9,
      });

      const generationColumns = client
        .prepare("PRAGMA table_info(generations)")
        .all()
        .map((column) => (column as { name: string }).name);
      expect(generationColumns).not.toContain("input_tokens");
      expect(generationColumns).not.toContain("cost_amount_nanos");
      expect(generationColumns).not.toContain("provider_started_at");
    } finally {
      client.close();
    }
  });
});
