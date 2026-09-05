import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SkillOrigin,
  parseSkillKey,
  parseSkillKindKey,
  parseUpdateSkillInput,
} from "@jaquelene/domain";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import type { SkillKindRegistration } from "./types";
import { createSkills, skillPageSize } from "./skills";

const testSkillKind = Object.freeze({
  key: parseSkillKindKey("test"),
  name: "Test",
  description: "Exercises generic skill behavior.",
});
const testBuiltInSkillDefinition = Object.freeze({
  key: parseSkillKey("builtin.test.default"),
  ...parseUpdateSkillInput({
    title: "Default",
    prompt: "Default prompt content.",
  }),
});
const testBuiltInSkill = Object.freeze({
  ...testBuiltInSkillDefinition,
  kind: testSkillKind.key,
  origin: SkillOrigin.BuiltIn,
});
const testSkillRegistration = Object.freeze({
  definition: testSkillKind,
  builtInSkills: Object.freeze([testBuiltInSkillDefinition]),
  fallbackSkillKey: testBuiltInSkillDefinition.key,
}) satisfies SkillKindRegistration;

const directories: string[] = [];
const databases: Database[] = [];

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-skills-"));
  directories.push(directory);
  return join(directory, "jaquelene.sqlite");
}

function openEnvironment(path = createDatabasePath(), now?: () => number) {
  const database = openDatabase(path);
  databases.push(database);
  const skills = createSkills(database, [testSkillRegistration], now);
  return { database, skills };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("skills", () => {
  it("resolves defaults without campaign state or an application", () => {
    const { skills } = openEnvironment();
    expect(skills.resolveDefault(testSkillKind.key)).toEqual(testBuiltInSkill);
    const custom = skills.create({
      kind: testSkillKind.key,
      title: "Custom",
      prompt: "Preserve the author's intent.",
    });
    skills.setDefault(testSkillKind.key, custom.key);
    expect(skills.resolveDefault(testSkillKind.key)).toEqual(custom);
    skills.delete(custom.key);
    expect(skills.resolveDefault(testSkillKind.key)).toEqual(testBuiltInSkill);
  });

  it("supports a skill kind with no built-in or default", () => {
    const database = openDatabase(createDatabasePath());
    databases.push(database);
    const skills = createSkills(database, [{ definition: testSkillKind, builtInSkills: [] }]);
    expect(skills.getKind(testSkillKind.key)).toEqual(testSkillKind);
    expect(skills.getKind(parseSkillKindKey("unknown"))).toBeNull();
    expect(skills.resolveDefault(testSkillKind.key)).toBeNull();
    expect(skills.getDefault(testSkillKind.key)).toEqual({
      kind: testSkillKind.key,
      skillKey: null,
      source: "none",
    });
    const custom = skills.create({
      kind: testSkillKind.key,
      title: "First",
      prompt: "Instructions.",
    });
    skills.setDefault(testSkillKind.key, custom.key);
    expect(skills.resolveDefault(testSkillKind.key)).toEqual(custom);
    skills.setDefault(testSkillKind.key);
    expect(skills.resolveDefault(testSkillKind.key)).toBeNull();
  });

  it("rejects invalid registrations before installing anything", () => {
    const database = openDatabase(createDatabasePath());
    databases.push(database);
    expect(() => createSkills(database, [testSkillRegistration, testSkillRegistration])).toThrow(
      'Skill kind "test" is registered twice.',
    );
    expect(() =>
      createSkills(database, [
        {
          ...testSkillRegistration,
          fallbackSkillKey: parseSkillKey("builtin.missing"),
        },
      ]),
    ).toThrow('Fallback skill "builtin.missing" is not registered for kind "test".');
    expect(database.$client.prepare("SELECT count(*) AS count FROM skill_kinds").get()).toEqual({
      count: 0,
    });
  });

  it("keeps registered skill kinds authoritative and ordered", () => {
    const database = openDatabase(createDatabasePath());
    databases.push(database);
    const setting = {
      definition: {
        key: parseSkillKindKey("setting"),
        name: "Setting",
        description: "Defines the world in which the campaign takes place.",
      },
      builtInSkills: [],
    } satisfies SkillKindRegistration;
    const skills = createSkills(database, [setting, testSkillRegistration]);

    expect(skills.listKinds()).toEqual([setting.definition, testSkillKind]);
    expect(() => skills.list({ kind: parseSkillKindKey("unregistered") })).toThrow(
      'Skill kind "unregistered" does not exist.',
    );
  });

  it("installs and repairs a built-in skill catalog", () => {
    const path = createDatabasePath();
    const first = openEnvironment(path);

    expect(first.skills.listKinds()).toEqual([testSkillKind]);
    expect(first.skills.list({ kind: testSkillKind.key }).skills).toEqual([testBuiltInSkill]);
    expect(
      first.skills.update(testBuiltInSkill.key, {
        title: "Changed",
        prompt: "Changed.",
      }),
    ).toBeNull();
    expect(first.skills.delete(testBuiltInSkill.key)).toBeNull();
    const obsoleteBuiltInSkillKey = parseSkillKey("builtin.test.obsolete");
    first.database.$client
      .prepare("UPDATE skills SET prompt = 'Corrupted' WHERE key = ?")
      .run(testBuiltInSkill.key);
    first.database.$client
      .prepare("INSERT INTO skills (key, kind, origin, title, prompt) VALUES (?, ?, ?, ?, ?)")
      .run(
        obsoleteBuiltInSkillKey,
        testSkillKind.key,
        SkillOrigin.BuiltIn,
        "Obsolete",
        "Remove me.",
      );
    closeDatabase(first.database);

    const reopened = openEnvironment(path);
    expect(reopened.skills.get(testBuiltInSkill.key)).toEqual(testBuiltInSkill);
    expect(reopened.skills.get(obsoleteBuiltInSkillKey)).toBeNull();
  });

  it("enforces lifecycle metadata at the persistence boundary", () => {
    const { database } = openEnvironment();
    const insert = database.$client.prepare(
      "INSERT INTO skills (key, kind, origin, title, prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );

    expect(() =>
      insert.run(
        "skill_missing_timestamps",
        testSkillKind.key,
        SkillOrigin.Custom,
        "Missing timestamps",
        "Invalid custom prompt.",
        null,
        null,
      ),
    ).toThrow();
    expect(() =>
      insert.run(
        "skill_reversed_timestamps",
        testSkillKind.key,
        SkillOrigin.Custom,
        "Reversed timestamps",
        "Invalid custom prompt.",
        2,
        1,
      ),
    ).toThrow();
    expect(() =>
      insert.run(
        "builtin_test_timestamped",
        testSkillKind.key,
        SkillOrigin.BuiltIn,
        "Timestamped built-in",
        "Invalid built-in prompt.",
        1,
        1,
      ),
    ).toThrow();
  });

  it("creates, updates, persists, and pages custom skills", () => {
    let createdAt = 1;
    const path = createDatabasePath();
    const first = openEnvironment(path, () => createdAt++);
    const created = Array.from({ length: skillPageSize }, (_, index) =>
      first.skills.create({
        kind: testSkillKind.key,
        title: `Prompt ${index}`,
        prompt: `Prompt content ${index}.`,
      }),
    );
    const firstPage = first.skills.list({ kind: testSkillKind.key });

    expect(firstPage.skills).toHaveLength(skillPageSize);
    expect(firstPage.skills[0]).toEqual(testBuiltInSkill);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    first.skills.delete(created[created.length - 2]!.key);
    expect(
      first.skills.list({ kind: testSkillKind.key, cursor: firstPage.nextCursor! }).skills,
    ).toEqual([created.at(-1)]);
    const updated = first.skills.update(created[0]!.key, {
      title: "  Observer  ",
      prompt: "Describe only observable facts.",
    });
    const unchanged = first.skills.update(created[0]!.key, {
      title: "Observer",
      prompt: "Describe only observable facts.",
    });
    closeDatabase(first.database);

    expect(created[0]).toMatchObject({ createdAt: 1, updatedAt: 1 });
    expect(updated).toMatchObject({ createdAt: 1, updatedAt: 51 });
    expect(unchanged).toEqual(updated);
    expect(openEnvironment(path).skills.get(created[0]!.key)).toEqual(updated);
  });

  it("pages from built-in skills into custom skills", () => {
    const database = openDatabase(createDatabasePath());
    databases.push(database);
    const definitions = Array.from({ length: skillPageSize }, (_, index) => ({
      key: parseSkillKey(`builtin.test.${index.toString().padStart(2, "0")}`),
      ...parseUpdateSkillInput({
        title: `Built-in ${index}`,
        prompt: `Built-in prompt content ${index}.`,
      }),
    }));
    const module = {
      definition: testSkillKind,
      builtInSkills: definitions,
    } satisfies SkillKindRegistration;
    const skills = createSkills(database, [module], () => 1);
    const custom = skills.create({
      kind: testSkillKind.key,
      title: "Custom",
      prompt: "Custom prompt content.",
    });
    const firstPage = skills.list({ kind: testSkillKind.key });

    expect(firstPage.skills).toHaveLength(skillPageSize);
    expect(firstPage.skills.every(({ origin }) => origin === SkillOrigin.BuiltIn)).toBe(true);
    expect(skills.list({ kind: testSkillKind.key, cursor: firstPage.nextCursor! }).skills).toEqual([
      custom,
    ]);
  });

  it("restores the registered fallback when the default override is cleared", () => {
    const { skills } = openEnvironment();
    const custom = skills.create({
      kind: testSkillKind.key,
      title: "Custom",
      prompt: "Use second person.",
    });

    skills.setDefault(testSkillKind.key, custom.key);

    expect(skills.setDefault(testSkillKind.key)).toEqual({
      kind: testSkillKind.key,
      skillKey: testBuiltInSkill.key,
      source: "fallback",
    });
  });
});
