import {
  parseCreatePromptInput,
  parsePromptKey,
  parseUpdatePromptInput,
  type PromptKey,
  type PromptKindKey,
} from "@jaquelene/domain";
import { and, asc, eq, gt, inArray, notInArray, or } from "drizzle-orm";
import { campaignTable } from "#backend/campaign/schema";
import type { Database } from "#backend/database/database";
import { ids, type CampaignId } from "#backend/id";
import { decodeCursor, encodeCursor } from "#backend/pagination/cursor";
import {
  campaignPromptSelectionTable,
  promptDefaultOverrideTable,
  promptKindFallbackTable,
  promptKindTable,
  promptTable,
} from "./schema";
import type {
  CampaignPromptSelection,
  Prompt,
  PromptDefault,
  PromptKind,
  PromptKindRegistration,
  PromptPageRequest,
  SetCampaignPromptSelectionInput,
} from "./types";

type DatabaseReader = Pick<Database, "select">;

export const promptPageSize = 50;
const promptKindRegistrationLimit = 32;

function toPrompt(prompt: typeof promptTable.$inferSelect): Prompt {
  return { ...prompt };
}

function validateRegistrations(registrations: readonly PromptKindRegistration[]) {
  if (registrations.length > promptKindRegistrationLimit) {
    throw new TypeError(`At most ${promptKindRegistrationLimit} prompt kinds can be registered.`);
  }

  const kinds = new Set<PromptKindKey>();
  const prompts = new Set<string>();

  for (const registration of registrations) {
    const { definition, factoryPrompts, fallbackPromptKey } = registration;

    if (kinds.has(definition.key)) {
      throw new TypeError(`Prompt kind "${definition.key}" is registered twice.`);
    }

    kinds.add(definition.key);
    const kindPrompts = new Set<string>();

    for (const prompt of factoryPrompts) {
      if (prompt.kind !== definition.key || prompt.origin !== "factory") {
        throw new TypeError(`Factory prompt "${prompt.key}" has an invalid registration.`);
      }

      if (prompts.has(prompt.key)) {
        throw new TypeError(`Factory prompt "${prompt.key}" is registered twice.`);
      }

      prompts.add(prompt.key);
      kindPrompts.add(prompt.key);
    }

    if (fallbackPromptKey !== undefined && !kindPrompts.has(fallbackPromptKey)) {
      throw new TypeError(
        `Fallback prompt "${fallbackPromptKey}" is not registered for kind "${definition.key}".`,
      );
    }
  }
}

function installPromptKinds(database: Database, registrations: readonly PromptKindRegistration[]) {
  validateRegistrations(registrations);

  database.transaction((transaction) => {
    for (const { definition, factoryPrompts, fallbackPromptKey } of registrations) {
      transaction
        .insert(promptKindTable)
        .values(definition)
        .onConflictDoUpdate({
          target: promptKindTable.key,
          set: { name: definition.name, description: definition.description },
        })
        .run();

      for (const prompt of factoryPrompts) {
        transaction
          .insert(promptTable)
          .values(prompt)
          .onConflictDoUpdate({
            target: promptTable.key,
            set: {
              kind: prompt.kind,
              origin: prompt.origin,
              title: prompt.title,
              body: prompt.body,
              createdAt: prompt.createdAt,
            },
          })
          .run();
      }

      if (fallbackPromptKey === undefined) {
        transaction
          .delete(promptKindFallbackTable)
          .where(eq(promptKindFallbackTable.kind, definition.key))
          .run();
      } else {
        transaction
          .insert(promptKindFallbackTable)
          .values({ kind: definition.key, promptKey: fallbackPromptKey })
          .onConflictDoUpdate({
            target: promptKindFallbackTable.kind,
            set: { promptKey: fallbackPromptKey },
          })
          .run();
      }

      const factoryPromptKeys = factoryPrompts.map(({ key }) => key);
      const obsoleteFactoryPrompt = and(
        eq(promptTable.kind, definition.key),
        eq(promptTable.origin, "factory"),
        factoryPromptKeys.length === 0 ? undefined : notInArray(promptTable.key, factoryPromptKeys),
      );
      transaction.delete(promptTable).where(obsoleteFactoryPrompt).run();
    }
  });
}

function getKind(database: DatabaseReader, kind: PromptKindKey) {
  return database.select().from(promptKindTable).where(eq(promptKindTable.key, kind)).get() ?? null;
}

function requireKind(database: DatabaseReader, kind: PromptKindKey) {
  const definition = getKind(database, kind);

  if (!definition) {
    throw new RangeError(`Prompt kind "${kind}" does not exist.`);
  }

  return definition;
}

function getPromptForKind(database: DatabaseReader, kind: PromptKindKey, promptKey: PromptKey) {
  return (
    database
      .select()
      .from(promptTable)
      .where(and(eq(promptTable.kind, kind), eq(promptTable.key, promptKey)))
      .get() ?? null
  );
}

function requirePromptForKind(database: DatabaseReader, kind: PromptKindKey, promptKey: PromptKey) {
  const prompt = getPromptForKind(database, kind, promptKey);

  if (!prompt) {
    throw new RangeError(`Prompt "${promptKey}" does not exist for kind "${kind}".`);
  }

  return prompt;
}

function parsePromptCursor(cursor: string, kind: PromptKindKey) {
  const [cursorKind, createdAt, key] = decodeCursor(cursor, 3);

  if (
    cursorKind !== kind ||
    typeof createdAt !== "number" ||
    !Number.isSafeInteger(createdAt) ||
    createdAt < 0 ||
    typeof key !== "string" ||
    key.length === 0
  ) {
    throw new TypeError("Prompt cursor is invalid.");
  }

  return { createdAt, key: parsePromptKey(key) };
}

function readDefault(database: DatabaseReader, kind: PromptKindKey): PromptDefault {
  const selection = database
    .select({
      overridePromptKey: promptDefaultOverrideTable.promptKey,
      fallbackPromptKey: promptKindFallbackTable.promptKey,
    })
    .from(promptKindTable)
    .leftJoin(promptDefaultOverrideTable, eq(promptDefaultOverrideTable.kind, promptKindTable.key))
    .leftJoin(promptKindFallbackTable, eq(promptKindFallbackTable.kind, promptKindTable.key))
    .where(eq(promptKindTable.key, kind))
    .get();

  if (!selection) {
    throw new RangeError(`Prompt kind "${kind}" does not exist.`);
  }

  if (selection.overridePromptKey) {
    return { kind, promptKey: selection.overridePromptKey, source: "override" };
  }

  if (selection.fallbackPromptKey) {
    return { kind, promptKey: selection.fallbackPromptKey, source: "fallback" };
  }

  return { kind, promptKey: null, source: "none" };
}

function readCampaignSelection(
  database: DatabaseReader,
  campaignId: CampaignId,
  kind: PromptKindKey,
): CampaignPromptSelection | null {
  const selection = database
    .select({
      campaignId: campaignTable.id,
      selectedPromptKey: campaignPromptSelectionTable.promptKey,
      defaultPromptKey: promptDefaultOverrideTable.promptKey,
      fallbackPromptKey: promptKindFallbackTable.promptKey,
    })
    .from(campaignTable)
    .leftJoin(
      campaignPromptSelectionTable,
      and(
        eq(campaignPromptSelectionTable.campaignId, campaignTable.id),
        eq(campaignPromptSelectionTable.kind, kind),
      ),
    )
    .leftJoin(promptDefaultOverrideTable, eq(promptDefaultOverrideTable.kind, kind))
    .leftJoin(promptKindFallbackTable, eq(promptKindFallbackTable.kind, kind))
    .where(eq(campaignTable.id, campaignId))
    .get();

  if (!selection) {
    return null;
  }

  if (selection.selectedPromptKey) {
    return {
      campaignId,
      kind,
      selectedPromptKey: selection.selectedPromptKey,
      effectivePromptKey: selection.selectedPromptKey,
      source: "campaign",
    };
  }

  if (selection.defaultPromptKey) {
    return {
      campaignId,
      kind,
      effectivePromptKey: selection.defaultPromptKey,
      source: "default",
    };
  }

  if (selection.fallbackPromptKey) {
    return {
      campaignId,
      kind,
      effectivePromptKey: selection.fallbackPromptKey,
      source: "fallback",
    };
  }

  return { campaignId, kind, effectivePromptKey: null, source: "none" };
}

export function createPrompts(
  database: Database,
  registrations: readonly PromptKindRegistration[],
  now: () => number = Date.now,
) {
  installPromptKinds(database, registrations);
  const registeredKindKeys = registrations.map(({ definition }) => definition.key);

  return {
    listKinds(): readonly PromptKind[] {
      if (registeredKindKeys.length === 0) {
        return [];
      }

      return database
        .select()
        .from(promptKindTable)
        .where(inArray(promptKindTable.key, registeredKindKeys))
        .orderBy(asc(promptKindTable.key))
        .all()
        .map((kind) => ({ ...kind }));
    },

    list({ kind, cursor }: PromptPageRequest) {
      requireKind(database, kind);
      const cursorPrompt = cursor === undefined ? undefined : parsePromptCursor(cursor, kind);

      const afterCursor = cursorPrompt
        ? or(
            gt(promptTable.createdAt, cursorPrompt.createdAt),
            and(
              eq(promptTable.createdAt, cursorPrompt.createdAt),
              gt(promptTable.key, cursorPrompt.key),
            ),
          )
        : undefined;
      const rows = database
        .select()
        .from(promptTable)
        .where(and(eq(promptTable.kind, kind), afterCursor))
        .orderBy(asc(promptTable.createdAt), asc(promptTable.key))
        .limit(promptPageSize + 1)
        .all();
      const hasNextPage = rows.length > promptPageSize;
      const pageRows = hasNextPage ? rows.slice(0, promptPageSize) : rows;
      const lastPrompt = hasNextPage ? pageRows.at(-1) : undefined;
      const nextCursor = lastPrompt
        ? encodeCursor([kind, lastPrompt.createdAt, lastPrompt.key])
        : undefined;

      return {
        prompts: pageRows.map(toPrompt),
        ...(nextCursor ? { nextCursor } : {}),
      };
    },

    get(key: PromptKey) {
      const prompt = database.select().from(promptTable).where(eq(promptTable.key, key)).get();
      return prompt ? toPrompt(prompt) : null;
    },

    create(input: unknown) {
      const { kind, title, body } = parseCreatePromptInput(input);
      requireKind(database, kind);
      const prompt = {
        key: parsePromptKey(ids.prompt.create()),
        kind,
        origin: "custom" as const,
        title,
        body,
        createdAt: now(),
      };
      database.insert(promptTable).values(prompt).run();
      return toPrompt(prompt);
    },

    update(key: PromptKey, input: unknown) {
      const { title, body } = parseUpdatePromptInput(input);
      const prompt = database
        .update(promptTable)
        .set({ title, body })
        .where(and(eq(promptTable.key, key), eq(promptTable.origin, "custom")))
        .returning()
        .get();
      return prompt ? toPrompt(prompt) : null;
    },

    delete(key: PromptKey) {
      return database.transaction((transaction) => {
        const deleted = transaction
          .delete(promptTable)
          .where(and(eq(promptTable.key, key), eq(promptTable.origin, "custom")))
          .returning({ kind: promptTable.kind })
          .get();

        if (!deleted) {
          return null;
        }

        const nextDefault = readDefault(transaction, deleted.kind);
        return { kind: deleted.kind, defaultPromptKey: nextDefault.promptKey };
      });
    },

    getDefault(kind: PromptKindKey) {
      return readDefault(database, kind);
    },

    setDefault(kind: PromptKindKey, promptKey: PromptKey) {
      requirePromptForKind(database, kind, promptKey);
      const fallback = database
        .select({ promptKey: promptKindFallbackTable.promptKey })
        .from(promptKindFallbackTable)
        .where(eq(promptKindFallbackTable.kind, kind))
        .get();

      if (fallback?.promptKey === promptKey) {
        database
          .delete(promptDefaultOverrideTable)
          .where(eq(promptDefaultOverrideTable.kind, kind))
          .run();
      } else {
        database
          .insert(promptDefaultOverrideTable)
          .values({ kind, promptKey })
          .onConflictDoUpdate({
            target: promptDefaultOverrideTable.kind,
            set: { promptKey },
          })
          .run();
      }

      return readDefault(database, kind);
    },

    getCampaignSelection(campaignId: CampaignId, kind: PromptKindKey) {
      requireKind(database, kind);
      return readCampaignSelection(database, campaignId, kind);
    },

    setCampaignSelection({ campaignId, kind, promptKey }: SetCampaignPromptSelectionInput) {
      return database.transaction((transaction) => {
        const campaign = transaction
          .select({ id: campaignTable.id })
          .from(campaignTable)
          .where(eq(campaignTable.id, campaignId))
          .get();

        if (!campaign) {
          return null;
        }

        requireKind(transaction, kind);

        if (promptKey === undefined) {
          transaction
            .delete(campaignPromptSelectionTable)
            .where(
              and(
                eq(campaignPromptSelectionTable.campaignId, campaignId),
                eq(campaignPromptSelectionTable.kind, kind),
              ),
            )
            .run();
        } else {
          requirePromptForKind(transaction, kind, promptKey);
          transaction
            .insert(campaignPromptSelectionTable)
            .values({ campaignId, kind, promptKey })
            .onConflictDoUpdate({
              target: [campaignPromptSelectionTable.campaignId, campaignPromptSelectionTable.kind],
              set: { promptKey },
            })
            .run();
        }

        return readCampaignSelection(transaction, campaignId, kind);
      });
    },

    resolveCampaignPrompt(campaignId: CampaignId, kind: PromptKindKey) {
      const selection = readCampaignSelection(database, campaignId, kind);

      if (!selection?.effectivePromptKey) {
        return null;
      }

      const prompt = getPromptForKind(database, kind, selection.effectivePromptKey);

      if (!prompt) {
        throw new Error(
          `Campaign "${campaignId}" resolves unavailable prompt "${selection.effectivePromptKey}".`,
        );
      }

      return toPrompt(prompt);
    },
  };
}

export type PromptEngine = ReturnType<typeof createPrompts>;
