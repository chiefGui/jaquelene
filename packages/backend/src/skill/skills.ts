import {
  SkillOrigin,
  parseCreateSkillInput,
  parseCustomSkill,
  parseSkill,
  parseSkillKey,
  parseUpdateSkillInput,
  type SkillKey,
  type SkillKindKey,
} from "@jaquelene/domain";
import { and, asc, eq, gt, isNotNull, isNull, notInArray, or } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import { ids } from "#backend/id";
import { decodeCursor, encodeCursor } from "#backend/pagination/cursor";
import {
  skillDefaultOverrideTable,
  skillKindFallbackTable,
  skillKindTable,
  skillTable,
} from "./schema";
import type {
  CustomSkill,
  Skill,
  SkillDefault,
  SkillKind,
  SkillKindRegistration,
  SkillPageRequest,
} from "./types";

type DatabaseReader = Pick<Database, "select">;

export const skillPageSize = 50;
const skillKindRegistrationLimit = 32;

function toSkill(skill: typeof skillTable.$inferSelect): Skill {
  const common = {
    key: skill.key,
    kind: skill.kind,
    origin: skill.origin,
    title: skill.title,
    prompt: skill.prompt,
  };

  if (skill.origin === SkillOrigin.BuiltIn) {
    return parseSkill(common);
  }
  return parseSkill({ ...common, createdAt: skill.createdAt, updatedAt: skill.updatedAt });
}

function toCustomSkill(skill: typeof skillTable.$inferSelect): CustomSkill {
  const parsed = toSkill(skill);

  if (parsed.origin !== SkillOrigin.Custom) {
    throw new TypeError(`Skill "${parsed.key}" is not custom.`);
  }

  return parsed;
}

function validateRegistrations(registrations: readonly SkillKindRegistration[]) {
  if (registrations.length > skillKindRegistrationLimit) {
    throw new TypeError(`At most ${skillKindRegistrationLimit} skill kinds can be registered.`);
  }

  const kinds = new Set<SkillKindKey>();
  const skills = new Set<string>();

  for (const registration of registrations) {
    const { definition, builtInSkills, fallbackSkillKey } = registration;

    if (kinds.has(definition.key)) {
      throw new TypeError(`Skill kind "${definition.key}" is registered twice.`);
    }

    kinds.add(definition.key);
    const kindSkills = new Set<string>();

    for (const skill of builtInSkills) {
      if (skills.has(skill.key)) {
        throw new TypeError(`Built-in skill "${skill.key}" is registered twice.`);
      }

      skills.add(skill.key);
      kindSkills.add(skill.key);
    }

    if (fallbackSkillKey !== undefined && !kindSkills.has(fallbackSkillKey)) {
      throw new TypeError(
        `Fallback skill "${fallbackSkillKey}" is not registered for kind "${definition.key}".`,
      );
    }
  }
}

function installSkillCatalog(database: Database, registrations: readonly SkillKindRegistration[]) {
  validateRegistrations(registrations);

  database.transaction((transaction) => {
    for (const { definition, builtInSkills, fallbackSkillKey } of registrations) {
      transaction
        .insert(skillKindTable)
        .values(definition)
        .onConflictDoUpdate({
          target: skillKindTable.key,
          set: { name: definition.name, description: definition.description },
        })
        .run();

      for (const skill of builtInSkills) {
        transaction
          .insert(skillTable)
          .values({
            ...skill,
            kind: definition.key,
            origin: SkillOrigin.BuiltIn,
            createdAt: null,
            updatedAt: null,
          })
          .onConflictDoUpdate({
            target: skillTable.key,
            set: {
              kind: definition.key,
              origin: SkillOrigin.BuiltIn,
              title: skill.title,
              prompt: skill.prompt,
              createdAt: null,
              updatedAt: null,
            },
          })
          .run();
      }

      if (fallbackSkillKey === undefined) {
        transaction
          .delete(skillKindFallbackTable)
          .where(eq(skillKindFallbackTable.kind, definition.key))
          .run();
      } else {
        transaction
          .insert(skillKindFallbackTable)
          .values({ kind: definition.key, skillKey: fallbackSkillKey })
          .onConflictDoUpdate({
            target: skillKindFallbackTable.kind,
            set: { skillKey: fallbackSkillKey },
          })
          .run();
      }

      const builtInSkillKeys = builtInSkills.map(({ key }) => key);
      let excludedKeys;
      if (builtInSkillKeys.length > 0) {
        excludedKeys = notInArray(skillTable.key, builtInSkillKeys);
      }
      const obsoleteBuiltInSkill = and(
        eq(skillTable.kind, definition.key),
        eq(skillTable.origin, SkillOrigin.BuiltIn),
        excludedKeys,
      );
      transaction.delete(skillTable).where(obsoleteBuiltInSkill).run();
    }
  });
}

function getSkillForKind(database: DatabaseReader, kind: SkillKindKey, skillKey: SkillKey) {
  return (
    database
      .select()
      .from(skillTable)
      .where(and(eq(skillTable.kind, kind), eq(skillTable.key, skillKey)))
      .get() ?? null
  );
}

function requireSkillForKind(database: DatabaseReader, kind: SkillKindKey, skillKey: SkillKey) {
  const skill = getSkillForKind(database, kind, skillKey);

  if (!skill) {
    throw new RangeError(`Skill "${skillKey}" does not exist for kind "${kind}".`);
  }

  return skill;
}

function parseSkillCursor(cursor: string, kind: SkillKindKey) {
  const [cursorKind, createdAt, key] = decodeCursor(cursor, 3);

  if (cursorKind !== kind || typeof key !== "string" || key.length === 0) {
    throw new TypeError("Skill cursor is invalid.");
  }

  const skillKey = parseSkillKey(key);

  if (createdAt === null) {
    return { createdAt, key: skillKey } as const;
  }

  if (typeof createdAt !== "number" || !Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new TypeError("Skill cursor is invalid.");
  }

  return { createdAt, key: skillKey } as const;
}

function readDefault(database: DatabaseReader, kind: SkillKindKey): SkillDefault {
  const selection = database
    .select({
      overrideSkillKey: skillDefaultOverrideTable.skillKey,
      fallbackSkillKey: skillKindFallbackTable.skillKey,
    })
    .from(skillKindTable)
    .leftJoin(skillDefaultOverrideTable, eq(skillDefaultOverrideTable.kind, skillKindTable.key))
    .leftJoin(skillKindFallbackTable, eq(skillKindFallbackTable.kind, skillKindTable.key))
    .where(eq(skillKindTable.key, kind))
    .get();

  if (!selection) {
    throw new RangeError(`Skill kind "${kind}" does not exist.`);
  }

  if (selection.overrideSkillKey) {
    return { kind, skillKey: selection.overrideSkillKey, source: "override" };
  }

  if (selection.fallbackSkillKey) {
    return { kind, skillKey: selection.fallbackSkillKey, source: "fallback" };
  }

  return { kind, skillKey: null, source: "none" };
}

export function createSkills(
  database: Database,
  registrations: readonly SkillKindRegistration[],
  now: () => number = Date.now,
) {
  installSkillCatalog(database, registrations);
  const registeredKinds = registrations.map(({ definition }) => definition);
  const kindsByKey = new Map(registeredKinds.map((kind) => [kind.key, kind]));

  function requireKind(kind: SkillKindKey) {
    if (!kindsByKey.has(kind)) {
      throw new RangeError(`Skill kind "${kind}" does not exist.`);
    }
  }

  return {
    getKind(kind: SkillKindKey): SkillKind | null {
      return kindsByKey.get(kind) ?? null;
    },

    listKinds(): readonly SkillKind[] {
      return registeredKinds;
    },

    list({ kind, cursor }: SkillPageRequest) {
      requireKind(kind);
      let afterCursor;
      if (cursor !== undefined) {
        const cursorSkill = parseSkillCursor(cursor, kind);
        if (cursorSkill.createdAt === null) {
          afterCursor = or(
            and(isNull(skillTable.createdAt), gt(skillTable.key, cursorSkill.key)),
            isNotNull(skillTable.createdAt),
          );
        } else {
          afterCursor = or(
            gt(skillTable.createdAt, cursorSkill.createdAt),
            and(
              eq(skillTable.createdAt, cursorSkill.createdAt),
              gt(skillTable.key, cursorSkill.key),
            ),
          );
        }
      }
      const rows = database
        .select()
        .from(skillTable)
        .where(and(eq(skillTable.kind, kind), afterCursor))
        .orderBy(asc(skillTable.createdAt), asc(skillTable.key))
        .limit(skillPageSize + 1)
        .all();
      const hasNextPage = rows.length > skillPageSize;
      const pageRows = rows.slice(0, skillPageSize);
      const skills = pageRows.map(toSkill);
      const lastSkill = skills.at(-1);
      if (!hasNextPage || !lastSkill) {
        return { skills };
      }
      let createdAt: number | null = null;
      if (lastSkill.origin === SkillOrigin.Custom) {
        createdAt = lastSkill.createdAt;
      }
      return { skills, nextCursor: encodeCursor([kind, createdAt, lastSkill.key]) };
    },

    get(key: SkillKey) {
      const skill = database.select().from(skillTable).where(eq(skillTable.key, key)).get();
      if (!skill) {
        return null;
      }
      return toSkill(skill);
    },

    create(input: unknown) {
      const { kind, title, prompt } = parseCreateSkillInput(input);
      requireKind(kind);
      const timestamp = now();
      const skill = parseCustomSkill({
        key: parseSkillKey(ids.skill.create()),
        kind,
        origin: SkillOrigin.Custom,
        title,
        prompt,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      database.insert(skillTable).values(skill).run();
      return skill;
    },

    update(key: SkillKey, input: unknown) {
      const { title, prompt } = parseUpdateSkillInput(input);
      return database.transaction((transaction) => {
        const currentRow = transaction
          .select()
          .from(skillTable)
          .where(and(eq(skillTable.key, key), eq(skillTable.origin, SkillOrigin.Custom)))
          .get();

        if (!currentRow) {
          return null;
        }

        const current = toCustomSkill(currentRow);

        if (current.title === title && current.prompt === prompt) {
          return current;
        }

        const skill = transaction
          .update(skillTable)
          .set({ title, prompt, updatedAt: Math.max(current.updatedAt, now()) })
          .where(eq(skillTable.key, key))
          .returning()
          .get();

        return toCustomSkill(skill);
      });
    },

    delete(key: SkillKey) {
      return (
        database
          .delete(skillTable)
          .where(and(eq(skillTable.key, key), eq(skillTable.origin, SkillOrigin.Custom)))
          .returning({ kind: skillTable.kind })
          .get() ?? null
      );
    },

    getDefault(kind: SkillKindKey) {
      requireKind(kind);
      return readDefault(database, kind);
    },

    resolveDefault(kind: SkillKindKey) {
      requireKind(kind);
      const selection = readDefault(database, kind);
      if (!selection.skillKey) {
        return null;
      }
      return toSkill(requireSkillForKind(database, kind, selection.skillKey));
    },

    setDefault(kind: SkillKindKey, skillKey?: SkillKey) {
      requireKind(kind);

      if (skillKey === undefined) {
        database
          .delete(skillDefaultOverrideTable)
          .where(eq(skillDefaultOverrideTable.kind, kind))
          .run();
        return readDefault(database, kind);
      }

      requireSkillForKind(database, kind, skillKey);
      const fallback = database
        .select({ skillKey: skillKindFallbackTable.skillKey })
        .from(skillKindFallbackTable)
        .where(eq(skillKindFallbackTable.kind, kind))
        .get();

      if (fallback?.skillKey === skillKey) {
        database
          .delete(skillDefaultOverrideTable)
          .where(eq(skillDefaultOverrideTable.kind, kind))
          .run();
      } else {
        database
          .insert(skillDefaultOverrideTable)
          .values({ kind, skillKey })
          .onConflictDoUpdate({
            target: skillDefaultOverrideTable.kind,
            set: { skillKey },
          })
          .run();
      }

      return readDefault(database, kind);
    },
  };
}
