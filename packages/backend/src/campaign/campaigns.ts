import {
  parseCampaignTitleInput,
  parsePromptKey,
  promptKindKeySchema,
  type CampaignGenerationPreferences as ComposableCampaignGenerationPreferences,
  type CampaignTitle,
  type PromptKey,
  type PromptKindKey,
} from "@jaquelene/domain";
import { and, desc, eq, getTableColumns, lt, or } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import { ids, type CampaignId, type ThreadId } from "#backend/id";
import { requireReasoningPreset, type ReasoningPreset } from "#backend/model/reasoning";
import { decodeCursor, encodeCursor } from "#backend/pagination/cursor";
import { campaignPromptSelectionTable, promptKindTable, promptTable } from "#backend/prompt/schema";
import { requireModelSelection, type ModelSelection } from "#backend/provider/provider";
import { insertThread } from "#backend/thread/threads";
import { threadTable, turnTable } from "#backend/thread/schema";
import { campaignGenerationPreferencesTable, campaignTable } from "./schema";

export const campaignPageSize = 50;
const campaignCompositionLimit = 32;

export type CampaignGenerationPreferences = ComposableCampaignGenerationPreferences<
  ModelSelection,
  ReasoningPreset
>;

export type CampaignPromptSelectionInput = Readonly<{
  kind: PromptKindKey;
  promptKey?: PromptKey;
}>;

export type StartCampaignInput = Readonly<{
  title: string;
  composition: readonly CampaignPromptSelectionInput[];
}>;

export type CampaignPageRequest = Readonly<{
  cursor?: string;
}>;

export type Campaign = Readonly<{
  id: CampaignId;
  title: CampaignTitle;
  threadId: ThreadId;
  startedAt: number;
  generationPreferences?: CampaignGenerationPreferences;
}>;

export type CampaignPage = Readonly<{
  campaigns: readonly Campaign[];
  nextCursor?: string;
}>;

export type CampaignDeletion = Readonly<{
  id: CampaignId;
  threadId: ThreadId;
}>;

function requireCampaignGenerationPreferences(preferences: CampaignGenerationPreferences) {
  if (preferences.model === undefined && preferences.reasoningPreset === undefined) {
    throw new TypeError("Campaign generation preferences must contain at least one preference.");
  }

  if (preferences.model !== undefined) {
    requireModelSelection(preferences.model);
  }

  if (preferences.reasoningPreset !== undefined) {
    requireReasoningPreset(preferences.reasoningPreset);
  }
}

function parseComposition(value: unknown): readonly CampaignPromptSelectionInput[] {
  if (!Array.isArray(value) || value.length > campaignCompositionLimit) {
    throw new TypeError("Campaign composition is invalid.");
  }

  const seenKinds = new Set<PromptKindKey>();

  return value.map((selection) => {
    if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
      throw new TypeError("Campaign prompt selection is invalid.");
    }

    const keys = Object.keys(selection);

    if (!keys.every((key) => key === "kind" || key === "promptKey") || !("kind" in selection)) {
      throw new TypeError("Campaign prompt selection is invalid.");
    }

    const kindResult = promptKindKeySchema.safeParse(selection.kind);

    if (!kindResult.success) {
      throw new TypeError("Campaign prompt kind is invalid.", { cause: kindResult.error });
    }

    if (seenKinds.has(kindResult.data)) {
      throw new TypeError(`Campaign composition contains prompt kind "${kindResult.data}" twice.`);
    }

    seenKinds.add(kindResult.data);
    const promptKey = "promptKey" in selection ? selection.promptKey : undefined;

    return {
      kind: kindResult.data,
      ...(promptKey === undefined ? {} : { promptKey: parsePromptKey(promptKey) }),
    };
  });
}

function parseStartCampaignInput(value: StartCampaignInput) {
  if (!value || typeof value !== "object") {
    throw new TypeError("Campaign input is invalid.");
  }

  const keys = Object.keys(value);

  if (!keys.every((key) => key === "title" || key === "composition")) {
    throw new TypeError("Campaign input is invalid.");
  }

  const { title } = parseCampaignTitleInput({ title: value.title });
  return { title, composition: parseComposition(value.composition) };
}

type StoredCampaign = typeof campaignTable.$inferSelect & {
  generationPreferences: Omit<
    typeof campaignGenerationPreferencesTable.$inferSelect,
    "campaignId"
  > | null;
};

const campaignSelection = {
  ...getTableColumns(campaignTable),
  generationPreferences: {
    providerId: campaignGenerationPreferencesTable.providerId,
    modelId: campaignGenerationPreferencesTable.modelId,
    name: campaignGenerationPreferencesTable.name,
    brandId: campaignGenerationPreferencesTable.brandId,
    reasoningPreset: campaignGenerationPreferencesTable.reasoningPreset,
  },
};

function toCampaign({ generationPreferences, ...campaign }: StoredCampaign): Campaign {
  if (!generationPreferences) {
    return campaign;
  }

  const { providerId, modelId, name, brandId, reasoningPreset } = generationPreferences;
  const model =
    providerId !== null && modelId !== null && name !== null && brandId !== null
      ? { providerId, modelId, name, brandId }
      : undefined;

  if (!model && (providerId !== null || modelId !== null || name !== null || brandId !== null)) {
    throw new Error(`Campaign "${campaign.id}" has incomplete generation model preferences.`);
  }

  const preferences: CampaignGenerationPreferences = {
    ...(model ? { model } : {}),
    ...(reasoningPreset === null ? {} : { reasoningPreset }),
  };
  requireCampaignGenerationPreferences(preferences);

  return { ...campaign, generationPreferences: preferences };
}

function parseCampaignCursor(cursor: string) {
  const [startedAt, idInput] = decodeCursor(cursor, 2);

  if (typeof startedAt !== "number" || !Number.isSafeInteger(startedAt) || startedAt < 0) {
    throw new TypeError("Campaign cursor is invalid.");
  }

  if (typeof idInput !== "string") {
    throw new TypeError("Campaign cursor is invalid.");
  }

  try {
    return { startedAt, id: ids.campaign.parse(idInput) };
  } catch (error) {
    throw new TypeError("Campaign cursor is invalid.", { cause: error });
  }
}

export function createCampaigns(database: Database, now: () => number = Date.now) {
  return {
    start(input: StartCampaignInput) {
      const { title, composition } = parseStartCampaignInput(input);
      const startedAt = now();

      return database.transaction((transaction) => {
        for (const { kind, promptKey } of composition) {
          const promptKind = transaction
            .select({ key: promptKindTable.key })
            .from(promptKindTable)
            .where(eq(promptKindTable.key, kind))
            .get();

          if (!promptKind) {
            throw new RangeError(`Prompt kind "${kind}" does not exist.`);
          }

          if (promptKey !== undefined) {
            const prompt = transaction
              .select({ key: promptTable.key })
              .from(promptTable)
              .where(and(eq(promptTable.kind, kind), eq(promptTable.key, promptKey)))
              .get();

            if (!prompt) {
              throw new RangeError(`Prompt "${promptKey}" does not exist for kind "${kind}".`);
            }
          }
        }

        const thread = insertThread(transaction, startedAt);
        const campaign = {
          id: ids.campaign.create(),
          title,
          threadId: thread.id,
          startedAt,
        };
        transaction.insert(campaignTable).values(campaign).run();

        for (const { kind, promptKey } of composition) {
          if (promptKey === undefined) {
            continue;
          }
          transaction
            .insert(campaignPromptSelectionTable)
            .values({ campaignId: campaign.id, kind, promptKey })
            .run();
        }

        return campaign;
      });
    },

    list({ cursor }: CampaignPageRequest = {}) {
      const cursorCampaign = cursor === undefined ? undefined : parseCampaignCursor(cursor);

      const beforeCursor = cursorCampaign
        ? or(
            lt(campaignTable.startedAt, cursorCampaign.startedAt),
            and(
              eq(campaignTable.startedAt, cursorCampaign.startedAt),
              lt(campaignTable.id, cursorCampaign.id),
            ),
          )
        : undefined;
      const rows = database
        .select(campaignSelection)
        .from(campaignTable)
        .leftJoin(
          campaignGenerationPreferencesTable,
          eq(campaignGenerationPreferencesTable.campaignId, campaignTable.id),
        )
        .where(beforeCursor)
        .orderBy(desc(campaignTable.startedAt), desc(campaignTable.id))
        .limit(campaignPageSize + 1)
        .all();
      const hasNextPage = rows.length > campaignPageSize;
      const pageRows = hasNextPage ? rows.slice(0, campaignPageSize) : rows;
      const lastCampaign = hasNextPage ? pageRows.at(-1) : undefined;
      const nextCursor = lastCampaign
        ? encodeCursor([lastCampaign.startedAt, lastCampaign.id])
        : undefined;

      return {
        campaigns: pageRows.map(toCampaign),
        ...(nextCursor ? { nextCursor } : {}),
      };
    },

    get(id: CampaignId) {
      const campaign = database
        .select(campaignSelection)
        .from(campaignTable)
        .leftJoin(
          campaignGenerationPreferencesTable,
          eq(campaignGenerationPreferencesTable.campaignId, campaignTable.id),
        )
        .where(eq(campaignTable.id, id))
        .get();
      return campaign ? toCampaign(campaign) : null;
    },

    delete(id: CampaignId): CampaignDeletion | null {
      return database.transaction((transaction) => {
        const campaign = transaction
          .select({ id: campaignTable.id, threadId: campaignTable.threadId })
          .from(campaignTable)
          .where(eq(campaignTable.id, id))
          .get();

        if (!campaign) {
          return null;
        }

        const pendingGeneration = transaction
          .select({ id: generationTable.id })
          .from(generationTable)
          .innerJoin(turnTable, eq(turnTable.id, generationTable.turnId))
          .where(
            and(eq(turnTable.threadId, campaign.threadId), eq(generationTable.status, "pending")),
          )
          .get();

        if (pendingGeneration) {
          throw new Error("Campaign cannot be deleted while a reply is being generated.");
        }

        const deletedCampaign = transaction
          .delete(campaignTable)
          .where(eq(campaignTable.id, campaign.id))
          .run();

        if (deletedCampaign.changes !== 1) {
          throw new Error(`Campaign "${campaign.id}" was not deleted.`);
        }

        const deletedThread = transaction
          .delete(threadTable)
          .where(eq(threadTable.id, campaign.threadId))
          .run();

        if (deletedThread.changes !== 1) {
          throw new Error(`Thread "${campaign.threadId}" was not deleted.`);
        }

        return campaign;
      });
    },

    rename(id: CampaignId, titleInput: unknown) {
      const { title } = parseCampaignTitleInput({ title: titleInput });
      const campaign = database
        .update(campaignTable)
        .set({ title })
        .where(eq(campaignTable.id, id))
        .returning()
        .get();

      if (!campaign) {
        return null;
      }

      const generationPreferences = database
        .select({
          providerId: campaignGenerationPreferencesTable.providerId,
          modelId: campaignGenerationPreferencesTable.modelId,
          name: campaignGenerationPreferencesTable.name,
          brandId: campaignGenerationPreferencesTable.brandId,
          reasoningPreset: campaignGenerationPreferencesTable.reasoningPreset,
        })
        .from(campaignGenerationPreferencesTable)
        .where(eq(campaignGenerationPreferencesTable.campaignId, id))
        .get();
      return toCampaign({ ...campaign, generationPreferences: generationPreferences ?? null });
    },

    getContextForThread(threadId: ThreadId) {
      return (
        database
          .select({ id: campaignTable.id })
          .from(campaignTable)
          .where(eq(campaignTable.threadId, threadId))
          .get() ?? null
      );
    },

    setGenerationPreferences(id: CampaignId, preferences: CampaignGenerationPreferences | null) {
      if (preferences) {
        requireCampaignGenerationPreferences(preferences);
      }

      return database.transaction((transaction) => {
        const campaign = transaction
          .select()
          .from(campaignTable)
          .where(eq(campaignTable.id, id))
          .get();

        if (!campaign) {
          return null;
        }

        if (preferences) {
          const model = preferences.model;
          const values = {
            providerId: model?.providerId ?? null,
            modelId: model?.modelId ?? null,
            name: model?.name ?? null,
            brandId: model?.brandId ?? null,
            reasoningPreset: preferences.reasoningPreset ?? null,
          };
          transaction
            .insert(campaignGenerationPreferencesTable)
            .values({ campaignId: id, ...values })
            .onConflictDoUpdate({
              target: campaignGenerationPreferencesTable.campaignId,
              set: values,
            })
            .run();

          return {
            ...campaign,
            generationPreferences: {
              ...(model ? { model: { ...model } } : {}),
              ...(preferences.reasoningPreset === undefined
                ? {}
                : { reasoningPreset: preferences.reasoningPreset }),
            },
          };
        }

        transaction
          .delete(campaignGenerationPreferencesTable)
          .where(eq(campaignGenerationPreferencesTable.campaignId, id))
          .run();
        return campaign;
      });
    },
  };
}

export type CampaignEngine = ReturnType<typeof createCampaigns>;
export type Campaigns = Omit<CampaignEngine, "getContextForThread">;
