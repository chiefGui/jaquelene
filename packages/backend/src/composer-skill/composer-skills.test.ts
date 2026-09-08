import { afterEach, describe, expect, it } from "vite-plus/test";
import { Cause, Effect, Exit } from "effect";
import { skillIdSchema } from "@jaquelene/domain";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { createCampaigns } from "#backend/campaign/campaigns";
import { createThreads, appendAssistantMessageInTransaction } from "#backend/thread/threads";
import { generationTable } from "#backend/generation/schema";
import { createModelExecutor } from "#backend/model/execution";
import { createAccountedModelExecution } from "#backend/model/accounted-execution";
import { createProviderAttempts } from "#backend/usage/provider-attempts";
import { providerAttemptTable } from "#backend/usage/schema";
import type { ProviderGenerationRequest } from "#backend/provider/provider";
import { ProviderOperationError } from "#backend/provider/providers";
import { createComposerSkills } from "./composer-skills";
import { createFriendlyResponse } from "./friendly-response";
import { createThreadHistoryReader } from "#backend/thread/history";
import type { ComposerSkill } from "./types";

const databases: Database[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) closeDatabase(database);
});

function environment(
  generate = async (_request: ProviderGenerationRequest): Promise<{ text: string }> => ({
    text: "I'd be happy to help!",
  }),
) {
  const database = openDatabase(":memory:");
  databases.push(database);
  const campaigns = createCampaigns(database);
  const campaign = campaigns.start({
    title: "Campaign",
    openingScene: "A traveler waves hello.",
    scenario: "A quiet village.",
    composition: [],
  });
  const threads = createThreads(database);
  const attempts = createProviderAttempts(database, () => {});
  const calls: ProviderGenerationRequest[] = [];
  const modelExecutor = createModelExecutor(
    {
      getModel: () =>
        Effect.succeed({
          id: "campaign-model",
          name: "Campaign model",
          brandId: "test",
          reasoning: { defaultPreset: "off", supportedPresets: ["off", "high"] },
        }),
    },
    {
      generate: (providerId, request) =>
        Effect.tryPromise({
          try: () => {
            calls.push(request);
            return generate(request);
          },
          catch: (cause) =>
            new ProviderOperationError({ providerId, operation: "generate", cause }),
        }),
    },
  );
  const skill = createFriendlyResponse(createAccountedModelExecution(modelExecutor, attempts));
  const history = createThreadHistoryReader(database);
  const skills = createComposerSkills({ skills: [skill], campaigns, history, modelExecutor });
  const request = {
    skillId: skill.descriptor.id,
    threadId: campaign.threadId,
    configuration: {
      model: { providerId: "test", modelId: "campaign-model" },
      reasoningPreset: "high" as const,
    },
  };
  function turn(user: string, assistant: string) {
    return database.transaction((transaction) => {
      const { message: userMessage } = threads.startTurnInTransaction(
        transaction,
        campaign.threadId,
        user,
      );
      return appendAssistantMessageInTransaction(transaction, {
        threadId: campaign.threadId,
        turnId: userMessage.turnId!,
        parentMessageId: userMessage.id,
        activateIfMessageId: userMessage.id,
        content: assistant,
        createdAt: Date.now(),
      }).message;
    });
  }
  return {
    database,
    campaigns,
    campaign,
    threads,
    history,
    modelExecutor,
    attempts,
    calls,
    skill,
    skills,
    request,
    turn,
  };
}

describe("composer skills", () => {
  it("generates an editable draft with the campaign model and reasoning without changing history", async () => {
    const env = environment();
    const before = env.threads.getActiveMessagePath(env.campaign.threadId);
    const result = await Effect.runPromise(env.skills.execute(env.request));
    expect(result).toEqual({ text: "I'd be happy to help!" });
    expect(env.calls[0]).toMatchObject({
      modelId: "campaign-model",
      reasoning: { preset: "high", source: "selection" },
    });
    expect(env.calls[0]?.input.instructions).toHaveLength(1);
    expect(env.calls[0]?.input.instructions[0]?.content).toContain("player's next contribution");
    expect(env.calls[0]?.input.requestMessages).toEqual([
      { role: "user", content: "Scenario context:\n## Scenario\nA quiet village." },
    ]);
    expect(env.threads.getActiveMessagePath(env.campaign.threadId)).toEqual(before);
    expect(env.database.select().from(generationTable).all()).toEqual([]);
    expect(env.database.select().from(providerAttemptTable).all()).toMatchObject([
      { status: "completed", attributionKind: "campaign", attributionId: env.campaign.id },
    ]);
  });

  it("uses only the latest three complete turns on the active path", async () => {
    const env = environment();
    for (let index = 0; index < 20; index++) env.turn(`Player ${index}`, `Narrator ${index}`);
    await Effect.runPromise(env.skills.execute(env.request));
    expect(env.calls[0]?.input.dialogue.map(({ content }) => content)).toEqual([
      "Player 17",
      "Narrator 17",
      "Player 18",
      "Narrator 18",
      "Player 19",
      "Narrator 19",
    ]);
  });

  it("resolves each skill's declared history window without changing execution orchestration", async () => {
    const env = environment();
    for (let index = 0; index < 8; index++) {
      env.threads.startTurn(env.campaign.threadId, `Unanswered ${index}`);
      env.turn(`Player ${index}`, `Narrator ${index}`);
    }
    const fiveTurnSkill: ComposerSkill = {
      ...env.skill,
      descriptor: { ...env.skill.descriptor, id: skillIdSchema.parse("five-turns") },
      history: {
        ...env.skill.history,
        selection: { kind: "completed-turns", limit: 5, openingScene: "exclude" },
      },
    };
    const skills = createComposerSkills({
      skills: [env.skill, fiveTurnSkill],
      campaigns: env.campaigns,
      history: env.history,
      modelExecutor: env.modelExecutor,
    });
    await Effect.runPromise(
      skills.execute({ ...env.request, skillId: fiveTurnSkill.descriptor.id }),
    );
    expect(env.calls[0]?.input.dialogue.map(({ content }) => content)).toEqual([
      "Player 3",
      "Narrator 3",
      "Player 4",
      "Narrator 4",
      "Player 5",
      "Narrator 5",
      "Player 6",
      "Narrator 6",
      "Player 7",
      "Narrator 7",
    ]);
    await Effect.runPromise(skills.execute(env.request));
    expect(env.calls[1]?.input.dialogue.map(({ content }) => content)).toEqual([
      "Player 5",
      "Narrator 5",
      "Player 6",
      "Narrator 6",
      "Player 7",
      "Narrator 7",
    ]);
  });

  it("allows a skill to consume raw messages and decide whether an unfinished turn is acceptable", async () => {
    const env = environment();
    const pending = env.threads.startTurn(env.campaign.threadId, "Unanswered input").message;
    const skill: ComposerSkill = {
      descriptor: { ...env.skill.descriptor, id: skillIdSchema.parse("raw-message") },
      history: { selection: { kind: "messages", limit: 1 }, contentByteBudget: 100 },
      execute: (input) => {
        expect(input.context.history.head?.id).toBe(pending.id);
        expect(input.context.history.messages).toEqual([pending]);
        expect(input.context.scenario).toBe("A quiet village.");
        return Effect.succeed("Accepted unfinished turn");
      },
    };
    const skills = createComposerSkills({
      skills: [skill],
      campaigns: env.campaigns,
      history: env.history,
      modelExecutor: env.modelExecutor,
    });
    expect(
      await Effect.runPromise(skills.execute({ ...env.request, skillId: skill.descriptor.id })),
    ).toEqual({
      text: "Accepted unfinished turn",
    });
  });

  it("rejects oversized latest turns, empty threads, and unfinished turns before calling the provider", async () => {
    const env = environment();
    env.turn("x".repeat(env.skill.history.contentByteBudget), "Reply");
    await expect(Effect.runPromise(env.skills.execute(env.request))).rejects.toThrow("too long");
    const empty = env.campaigns.start({ title: "Empty", composition: [] });
    await expect(
      Effect.runPromise(env.skills.execute({ ...env.request, threadId: empty.threadId })),
    ).rejects.toThrow("conversation is needed");
    env.database.transaction((tx) =>
      env.threads.startTurnInTransaction(tx, empty.threadId, "Waiting"),
    );
    await expect(
      Effect.runPromise(env.skills.execute({ ...env.request, threadId: empty.threadId })),
    ).rejects.toThrow("Complete the latest turn");
    expect(env.calls).toHaveLength(0);
    expect(env.database.select().from(providerAttemptTable).all()).toEqual([]);
  });

  it.each(["edit", "append", "delete", "scenario"] as const)(
    "rejects a draft after context %s while preserving completed usage",
    async (change) => {
      const result = Promise.withResolvers<{ text: string }>();
      const started = Promise.withResolvers<void>();
      const env = environment(() => {
        started.resolve();
        return result.promise;
      });
      const running = Effect.runPromise(env.skills.execute(env.request));
      await started.promise;
      if (change === "edit") {
        const message = env.threads.getActiveMessagePath(env.campaign.threadId)[0]!;
        env.threads.editMessage({ messageId: message.id, content: "Changed opening" });
      } else if (change === "append") {
        env.turn("New input", "New reply");
      } else if (change === "scenario") {
        env.campaigns.setScenario(env.campaign.id, "Changed scenario");
      } else {
        env.campaigns.delete(env.campaign.id);
      }
      result.resolve({ text: "Stale draft" });
      await expect(running).rejects.toThrow();
      expect(env.database.select().from(providerAttemptTable).all()).toMatchObject([
        { status: "completed" },
      ]);
    },
  );

  it("settles an interrupted uncooperative provider and never delivers late output", async () => {
    const started = Promise.withResolvers<void>();
    const response = Promise.withResolvers<{ text: string }>();
    const env = environment(() => {
      started.resolve();
      return response.promise;
    });
    const controller = new AbortController();
    const running = Effect.runPromiseExit(env.skills.execute(env.request), {
      signal: controller.signal,
    });
    await started.promise;
    controller.abort();
    const exit = await running;
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    expect(env.database.select().from(providerAttemptTable).all()).toMatchObject([
      { status: "failed", failureKind: "interrupted" },
    ]);
    response.resolve({ text: "Late response" });
  });

  it("keeps a valid draft when edits outside its selected context change scan accounting", async () => {
    const started = Promise.withResolvers<void>();
    const response = Promise.withResolvers<{ text: string }>();
    const env = environment(() => {
      started.resolve();
      return response.promise;
    });
    const unanswered = env.threads.startTurn(env.campaign.threadId, "Unanswered").message;
    env.turn("Player", "Narrator");
    const running = Effect.runPromise(env.skills.execute(env.request));
    await started.promise;
    env.threads.editMessage({ messageId: unanswered.id, content: "Edited unanswered message" });
    response.resolve({ text: "Still current" });
    expect(await running).toEqual({ text: "Still current" });
  });

  it("records provider failures and keeps invalid-output calls completed in usage", async () => {
    const failure = environment(async () => {
      throw new Error("Provider unavailable");
    });
    await expect(Effect.runPromise(failure.skills.execute(failure.request))).rejects.toThrow();
    expect(failure.database.select().from(providerAttemptTable).all()).toMatchObject([
      { status: "failed", failureKind: "provider" },
    ]);
    const invalid = environment(async () => ({ text: "   " }));
    await expect(Effect.runPromise(invalid.skills.execute(invalid.request))).rejects.toThrow();
    expect(invalid.database.select().from(providerAttemptTable).all()).toMatchObject([
      { status: "completed" },
    ]);
  });

  it("rejects unknown skills before provider work", async () => {
    const env = environment();
    await expect(
      Effect.runPromise(
        env.skills.execute({ ...env.request, skillId: skillIdSchema.parse("missing") }),
      ),
    ).rejects.toThrow("unavailable");
    expect(env.calls).toEqual([]);
  });
});
