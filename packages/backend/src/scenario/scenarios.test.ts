import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { SCENARIO_TITLE_MAX_LENGTH } from "@jaquelene/domain";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import { createScenarios } from "./scenarios";

const directories: string[] = [];
const databases: Database[] = [];

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-scenarios-"));
  directories.push(directory);
  return join(directory, "jaquelene.sqlite");
}

function openScenarios(path: string) {
  const database = openDatabase(path);
  databases.push(database);
  return { database, scenarios: createScenarios(database) };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("scenarios", () => {
  it("creates trimmed scenarios and lists them", () => {
    const { scenarios } = openScenarios(createDatabasePath());
    const first = scenarios.create({ title: "  First scenario  " });
    const second = scenarios.create({ title: "Second scenario" });
    const listed = scenarios.list();

    expect(first.id).toMatch(/^scenario_/);
    expect(first.title).toBe("First scenario");
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(expect.arrayContaining([first, second]));
  });

  it("persists scenarios when the database is reopened", () => {
    const path = createDatabasePath();
    const firstConnection = openScenarios(path);
    const created = firstConnection.scenarios.create({ title: "Persistent scenario" });

    closeDatabase(firstConnection.database);

    expect(openScenarios(path).scenarios.get(created.id)).toEqual(created);
  });

  it("requires every stored scenario to have an identity", () => {
    const path = createDatabasePath();
    const { database } = openScenarios(path);
    closeDatabase(database);

    const client = new DatabaseSync(path);

    try {
      expect(() =>
        client
          .prepare("INSERT INTO scenarios (id, title) VALUES (?, ?)")
          .run(null, "Missing identity"),
      ).toThrow();
    } finally {
      client.close();
    }
  });

  it("rejects a title without text", () => {
    const { scenarios } = openScenarios(createDatabasePath());

    expect(() => scenarios.create({ title: " \n\t " })).toThrow(TypeError);
  });

  it("rejects a title beyond the character limit", () => {
    const { scenarios } = openScenarios(createDatabasePath());
    const maximumTitle = "🌘".repeat(SCENARIO_TITLE_MAX_LENGTH);

    expect(scenarios.create({ title: maximumTitle }).title).toBe(maximumTitle);
    expect(() => scenarios.create({ title: "x".repeat(SCENARIO_TITLE_MAX_LENGTH + 1) })).toThrow(
      TypeError,
    );
  });

  it("protects the title invariant at the database boundary", () => {
    const path = createDatabasePath();
    const { database } = openScenarios(path);
    closeDatabase(database);

    const client = new DatabaseSync(path);

    try {
      const insert = client.prepare("INSERT INTO scenarios (id, title) VALUES (?, ?)");

      for (const title of [
        " \n\t ",
        "Trailing whitespace ",
        "x".repeat(SCENARIO_TITLE_MAX_LENGTH + 1),
      ]) {
        expect(() => insert.run(ids.scenario.create(), title)).toThrow();
      }
    } finally {
      client.close();
    }
  });

  it("renames a scenario without changing its identity", () => {
    const { scenarios } = openScenarios(createDatabasePath());
    const created = scenarios.create({ title: "Original title" });

    const renamed = scenarios.rename(created.id, "  Renamed scenario  ");

    expect(renamed).toEqual({
      id: created.id,
      title: "Renamed scenario",
    });
  });

  it("does not replace a scenario title with no text", () => {
    const { scenarios } = openScenarios(createDatabasePath());
    const created = scenarios.create({ title: "Original title" });

    expect(() => scenarios.rename(created.id, " \n\t ")).toThrow(TypeError);
    expect(scenarios.get(created.id)).toEqual(created);
  });

  it("returns no scenario for an unknown identity", () => {
    const { scenarios } = openScenarios(createDatabasePath());

    expect(scenarios.get(ids.scenario.create())).toBeNull();
  });

  it("does not rename an unknown scenario", () => {
    const { scenarios } = openScenarios(createDatabasePath());

    expect(scenarios.rename(ids.scenario.create(), "New title")).toBeNull();
  });
});
