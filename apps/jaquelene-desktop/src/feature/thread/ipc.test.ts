import { Effect, Exit, FiberSet, Scope } from "effect";
import type { Generation, TurnAcceptance, GenerationSettlement } from "@jaquelene/backend";
import { ids } from "@jaquelene/backend";
import { ErrorSeverity, type ErrorReporter } from "@jaquelene/diagnostics";
import {
  GenerationIntent,
  ReasoningPreset,
  ReasoningPresetSource,
  ThreadMessagePageDirection,
} from "@jaquelene/ipc/main";
import type {
  CompletedReply as IpcCompletedReply,
  FailedReply as IpcFailedReply,
  IThreadsImpl,
  ITurnsImpl,
  SupersededReply as IpcSupersededReply,
  ThreadHistoryDeletion as IpcThreadHistoryDeletion,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

type CompletedGenerationSettlement = Extract<GenerationSettlement, { outcome: "completed" }>;
type FailedGenerationSettlement = Extract<GenerationSettlement, { outcome: "failed" }>;

const implementations = vi.hoisted(() => ({
  threads: undefined as IThreadsImpl | undefined,
  turns: undefined as ITurnsImpl | undefined,
  dispatchReplyFailed: vi.fn<(failure: IpcFailedReply) => void>(),
  dispatchReplyCompleted: vi.fn<(completion: IpcCompletedReply) => void>(),
  dispatchReplySuperseded: vi.fn<(reply: IpcSupersededReply) => void>(),
  dispatchHistoryDeleted: vi.fn<(deletion: IpcThreadHistoryDeletion) => void>(),
  dispatchMessageEdited: vi.fn(),
}));

vi.mock("@jaquelene/ipc/main", () => ({
  GenerationFailureKind: {
    Preparation: "preparation",
    Provider: "provider",
    InvalidOutput: "invalid-output",
    Interrupted: "interrupted",
    Storage: "storage",
  },
  GenerationStatus: {
    Pending: "pending",
    Completed: "completed",
    Failed: "failed",
  },
  GenerationIntent: {
    Reply: "reply",
    Retry: "retry",
    Regeneration: "regeneration",
  },
  ReasoningPreset: {
    Automatic: "automatic",
    On: "on",
    Off: "off",
    Minimal: "minimal",
    Low: "low",
    Medium: "medium",
    High: "high",
    XHigh: "xhigh",
    Max: "max",
  },
  ReasoningPresetSource: { ModelDefault: "model-default", Selection: "selection" },
  ThreadMessageAuthor: { User: "user", Assistant: "assistant" },
  ThreadMessagePageDirection: { Older: "older", Newer: "newer" },
  Threads: {
    for: () => ({
      setImplementation(implementation: IThreadsImpl) {
        implementations.threads = implementation;
      },
    }),
  },
  Turns: {
    for: () => ({
      setImplementation(implementation: ITurnsImpl) {
        implementations.turns = implementation;
        return {
          dispatchReplyFailed: implementations.dispatchReplyFailed,
          dispatchReplyCompleted: implementations.dispatchReplyCompleted,
          dispatchReplySuperseded: implementations.dispatchReplySuperseded,
          dispatchHistoryDeleted: implementations.dispatchHistoryDeleted,
          dispatchMessageEdited: implementations.dispatchMessageEdited,
        };
      },
    }),
  },
}));

import { createThreadMessaging } from "./ipc";

type ThreadMessagingThreads = Parameters<typeof createThreadMessaging>[0];
type ThreadMessagingTurns = Parameters<typeof createThreadMessaging>[1];

function exposeSingleRenderer(
  target: WebFrameMain,
  turns: ThreadMessagingTurns,
  diagnostics: ErrorReporter,
  threads: ThreadMessagingThreads = createBackendThreadsStub(),
) {
  return createThreadMessaging(threads, turns, diagnostics, Effect).expose(target);
}

function requireImplementations() {
  if (!implementations.threads || !implementations.turns) {
    throw new Error("Thread IPC implementations were not registered.");
  }

  return { threads: implementations.threads, turns: implementations.turns };
}

function createTurnState(intent: Generation["intent"] = "reply") {
  const threadId = ids.thread.create();
  const turnId = ids.turn.create();
  const userMessageId = ids.message.create();
  const assistantMessageId = ids.message.create();
  const userMessage = {
    id: userMessageId,
    threadId,
    turnId,
    parentMessageId: null,
    sequence: 1,
    author: "user" as const,
    content: "Hello",
    createdAt: 100,
  };
  const pendingGeneration: Generation = {
    threadId,
    id: ids.generation.create(),
    turnId,
    intent,
    providerId: "openrouter",
    modelId: "maker/model",
    reasoning: { preset: "high", source: "selection" },
    status: "pending",
    failureKind: null,
    outputMessageId: null,
    startedAt: 101,
    finishedAt: null,
  };
  const acceptance: TurnAcceptance = {
    userMessage,
    generation: pendingGeneration,
    threadActivity: { threadId, lastActivityAt: userMessage.createdAt, turnCount: 1 },
  };
  const assistantMessage = {
    id: assistantMessageId,
    threadId,
    turnId,
    parentMessageId: userMessageId,
    sequence: 2,
    author: "assistant" as const,
    content: "Hi",
    createdAt: 102,
  };
  const completed: CompletedGenerationSettlement = {
    sourceMessage: acceptance.userMessage,
    outcome: "completed",
    generation: {
      ...pendingGeneration,
      status: "completed",
      outputMessageId: assistantMessageId,
      finishedAt: 102,
    },
    assistantMessage,
    assistantActivated: true,
    threadActivity: { threadId, lastActivityAt: assistantMessage.createdAt, turnCount: 1 },
  };

  return { acceptance, completed };
}

function toGenerationAcceptance({ userMessage, ...acceptance }: TurnAcceptance) {
  return { ...acceptance, sourceMessage: userMessage };
}

function failedSettlement(
  failureKind: NonNullable<Generation["failureKind"]>,
  cause: unknown,
  intent: Generation["intent"] = "reply",
): FailedGenerationSettlement {
  const { acceptance } = createTurnState(intent);

  return {
    sourceMessage: acceptance.userMessage,
    threadActivity: acceptance.threadActivity,
    outcome: "failed",
    generation: {
      ...acceptance.generation,
      status: "failed",
      failureKind,
      finishedAt: 102,
    },
    failure: { cause },
  };
}

function emptyPage() {
  return {
    messages: [],
    generations: [],
    messageCountLimit: 50,
    messageMaxCodeUnits: 100_000,
    contentByteBudget: 128 * 1024,
    contentBytes: 0,
  };
}

function createBackendTurnsStub(
  overrides: Partial<ThreadMessagingTurns> = {},
): ThreadMessagingTurns {
  return {
    deleteFrom: vi.fn(),
    editMessage: vi.fn(),
    listForThread: vi.fn(emptyPage),
    regenerate: vi.fn(),
    submit: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

function createBackendThreadsStub(
  overrides: Partial<ThreadMessagingThreads> = {},
): ThreadMessagingThreads {
  return {
    getTranscript: vi.fn(),
    ...overrides,
  };
}

function activeTarget() {
  return {
    detached: false,
    isDestroyed: () => false,
  } as WebFrameMain;
}

beforeEach(() => {
  implementations.threads = undefined;
  implementations.turns = undefined;
  implementations.dispatchReplyFailed.mockClear();
  implementations.dispatchReplyCompleted.mockClear();
  implementations.dispatchReplySuperseded.mockClear();
  implementations.dispatchHistoryDeleted.mockClear();
  implementations.dispatchMessageEdited.mockClear();
});

describe("thread IPC", () => {
  it.each([false, true])(
    "stops settlement observers on shutdown without hiding cleanup defects (%s)",
    async (failCleanup) => {
      const { acceptance } = createTurnState();
      const cleanupFailure = new Error("Observer cleanup failed.");
      let settlement: Effect.Effect<never> = Effect.never;
      if (failCleanup) {
        settlement = settlement.pipe(Effect.ensuring(Effect.die(cleanupFailure)));
      }
      const turns = createBackendTurnsStub({
        submit: () => Effect.succeed({ acceptance, settlement, cancel: Effect.void }),
      });
      const report = vi.fn<ErrorReporter["report"]>();
      const scope = Scope.makeUnsafe();
      const runFork = await Effect.runPromise(FiberSet.makeRuntime().pipe(Scope.provide(scope)));
      const messaging = createThreadMessaging(
        createBackendThreadsStub(),
        turns,
        { report },
        {
          runPromise: Effect.runPromise,
          runFork,
        },
      );
      messaging.expose(activeTarget());
      await requireImplementations().turns.submit({
        threadId: acceptance.userMessage.threadId,
        content: "Hello",
        configuration: { model: { providerId: "openrouter", modelId: "maker/model" } },
      });

      await Effect.runPromise(Scope.close(scope, Exit.void));

      if (failCleanup) {
        expect(report).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ cause: cleanupFailure }),
          }),
        );
      } else {
        expect(report).not.toHaveBeenCalled();
      }
      expect(implementations.dispatchReplyCompleted).not.toHaveBeenCalled();
      expect(implementations.dispatchReplyFailed).not.toHaveBeenCalled();
    },
  );

  it("returns the current transcript from the thread capability", async () => {
    const threadId = ids.thread.create();
    const transcript = {
      threadId,
      entries: [
        {
          kind: "instruction" as const,
          sourceKey: "narrator",
          content: "Narrate clearly.",
        },
        {
          kind: "message" as const,
          messageId: ids.message.create(),
          author: "user" as const,
          content: "Hello",
        },
      ],
    };
    const getTranscript = vi.fn<ThreadMessagingThreads["getTranscript"]>(() => transcript);
    const backendThreads = createBackendThreadsStub({ getTranscript });

    exposeSingleRenderer(
      activeTarget(),
      createBackendTurnsStub(),
      { report: vi.fn() },
      backendThreads,
    );

    expect(await requireImplementations().threads.getTranscript(threadId)).toEqual(transcript);
    expect(getTranscript).toHaveBeenCalledWith(threadId);
  });

  it("maps forward history navigation into the backend contract", async () => {
    const threadId = ids.thread.create();
    const cursor = ids.message.create();
    const listForThread = vi.fn<ThreadMessagingTurns["listForThread"]>(emptyPage);
    const backendTurns = createBackendTurnsStub({ listForThread });

    exposeSingleRenderer(activeTarget(), backendTurns, { report: vi.fn() });
    await requireImplementations().threads.listMessages({
      threadId,
      direction: ThreadMessagePageDirection.Newer,
      cursor,
    });

    expect(listForThread).toHaveBeenCalledWith({ threadId, direction: "newer", cursor });
  });

  it("returns pending acceptance and dispatches committed settlement separately", async () => {
    const { acceptance, completed } = createTurnState();
    let settle!: (settlement: GenerationSettlement) => void;
    const settlement = new Promise<GenerationSettlement>((resolve) => {
      settle = resolve;
    });
    const listForThread = vi.fn<ThreadMessagingTurns["listForThread"]>(() => ({
      ...emptyPage(),
      messages: [acceptance.userMessage],
      generations: [acceptance.generation],
      contentBytes: 5,
    }));
    const submit = vi.fn<ThreadMessagingTurns["submit"]>(() =>
      Effect.succeed({
        acceptance,
        cancel: Effect.void,
        settlement: Effect.promise(() => settlement),
      }),
    );
    const backendTurns = createBackendTurnsStub({
      listForThread,
      submit,
      retry: vi.fn(() =>
        Effect.succeed({
          acceptance: toGenerationAcceptance(acceptance),
          settlement: Effect.promise(() => settlement),
          cancel: Effect.void,
        }),
      ),
    });
    const report = vi.fn<ErrorReporter["report"]>();

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    const ipc = requireImplementations();
    const page = await ipc.threads.listMessages({
      threadId: acceptance.userMessage.threadId,
      direction: ThreadMessagePageDirection.Older,
    });
    const configuration = {
      model: { providerId: "openrouter", modelId: "maker/model" },
      reasoningPreset: ReasoningPreset.High,
    };
    const submitted = await ipc.turns.submit({
      threadId: acceptance.userMessage.threadId,
      content: "Hello",
      configuration,
    });

    expect(listForThread).toHaveBeenCalledWith({
      threadId: acceptance.userMessage.threadId,
      direction: "older",
    });
    expect(page).toEqual({
      messages: [
        {
          id: acceptance.userMessage.id,
          threadId: acceptance.userMessage.threadId,
          turnId: acceptance.userMessage.turnId,
          sequence: 1,
          author: "user",
          content: "Hello",
          createdAt: 100,
        },
      ],
      generations: [
        {
          id: acceptance.generation.id,
          threadId: acceptance.generation.threadId,
          turnId: acceptance.userMessage.turnId,
          providerId: "openrouter",
          modelId: "maker/model",
          intent: GenerationIntent.Reply,
          reasoning: {
            preset: ReasoningPreset.High,
            source: ReasoningPresetSource.Selection,
          },
          status: "pending",
          startedAt: 101,
        },
      ],
      messageCountLimit: 50,
      messageMaxCodeUnits: 100_000,
      contentByteBudget: 128 * 1024,
      contentBytes: 5,
    });
    expect(submit).toHaveBeenCalledWith({
      threadId: acceptance.userMessage.threadId,
      content: "Hello",
      configuration: {
        model: configuration.model,
        reasoningPreset: "high",
      },
    });
    expect(submitted).toEqual({
      userMessage: page.messages[0],
      generation: expect.objectContaining({
        intent: GenerationIntent.Reply,
        status: "pending",
      }),
      threadActivity: acceptance.threadActivity,
    });
    expect(implementations.dispatchReplyCompleted).not.toHaveBeenCalled();

    settle(completed);
    await vi.waitFor(() => expect(implementations.dispatchReplyCompleted).toHaveBeenCalledOnce());

    expect(implementations.dispatchReplyCompleted).toHaveBeenCalledWith({
      sourceMessage: page.messages[0],
      generation: expect.objectContaining({
        id: completed.generation.id,
        intent: GenerationIntent.Reply,
        status: "completed",
        outputMessageId: completed.assistantMessage.id,
      }),
      assistantMessage: expect.objectContaining({ content: "Hi" }),
      threadActivity: completed.threadActivity,
    });
    expect(report).not.toHaveBeenCalled();
  });

  it("publishes a superseded reply when its completion is not active", async () => {
    const { acceptance, completed } = createTurnState();
    const inactiveCompletion: CompletedGenerationSettlement = {
      ...completed,
      assistantActivated: false,
    };
    const backendTurns = createBackendTurnsStub({
      submit: vi.fn(() =>
        Effect.succeed({
          acceptance,
          cancel: Effect.void,
          settlement: Effect.succeed(inactiveCompletion),
        }),
      ),
    });
    const report = vi.fn<ErrorReporter["report"]>();

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: acceptance.userMessage.threadId,
      content: "Hello",
      configuration: { model: { providerId: "openrouter", modelId: "maker/model" } },
    });

    await vi.waitFor(() => expect(implementations.dispatchReplySuperseded).toHaveBeenCalledOnce());
    expect(implementations.dispatchReplySuperseded).toHaveBeenCalledWith({
      threadId: acceptance.userMessage.threadId,
    });
    expect(implementations.dispatchReplyCompleted).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it.each([
    ["preparation", "reply preparation"],
    ["invalid-output", "provider output validation"],
    ["storage", "reply storage"],
  ] as const)("reports durable %s failures after acceptance", async (failureKind, stage) => {
    const cause = new Error(`${failureKind} failed`);
    const failed = failedSettlement(failureKind, cause);
    const acceptance: TurnAcceptance = {
      userMessage: failed.sourceMessage,
      generation: { ...failed.generation, status: "pending", failureKind: null, finishedAt: null },
      threadActivity: failed.threadActivity,
    };
    const backendTurns = createBackendTurnsStub({
      submit: vi.fn(() =>
        Effect.succeed({ acceptance, cancel: Effect.void, settlement: Effect.succeed(failed) }),
      ),
    });
    const report = vi.fn<ErrorReporter["report"]>();

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: failed.sourceMessage.threadId,
      content: "Hello",
      configuration: { model: { providerId: "openrouter", modelId: "maker/model" } },
    });

    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    expect(report).toHaveBeenCalledWith({
      severity: ErrorSeverity.Error,
      operation: "thread.turn.submit",
      error: expect.objectContaining({ message: `Generation failed during ${stage}.`, cause }),
    });
    expect(implementations.dispatchReplyFailed).toHaveBeenCalledOnce();
  });

  it("labels unexpected retry failures as retry operations", async () => {
    const cause = new Error("Reply preparation failed");
    const failed = failedSettlement("preparation", cause, "retry");
    const acceptance: TurnAcceptance = {
      userMessage: failed.sourceMessage,
      generation: { ...failed.generation, status: "pending", failureKind: null, finishedAt: null },
      threadActivity: failed.threadActivity,
    };
    const retry = vi.fn<ThreadMessagingTurns["retry"]>(() =>
      Effect.succeed({
        acceptance: toGenerationAcceptance(acceptance),
        cancel: Effect.void,
        settlement: Effect.succeed(failed),
      }),
    );
    const backendTurns = createBackendTurnsStub({ retry });
    const report = vi.fn<ErrorReporter["report"]>();
    const configuration = {
      model: { providerId: "openrouter", modelId: "maker/model" },
    };

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    const accepted = await requireImplementations().turns.retry({
      turnId: failed.sourceMessage.turnId!,
      configuration,
    });

    expect(retry).toHaveBeenCalledWith({
      turnId: failed.sourceMessage.turnId!,
      configuration,
    });
    expect(accepted.status).toBe("pending");
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "thread.turn.retry" }),
    );
  });

  it.each([undefined, "Shorter."])(
    "maps regeneration with %j instructions and publishes its settlement",
    async (instructions) => {
      const { acceptance, completed } = createTurnState("regeneration");
      const assistantMessageId = ids.message.create();
      if (instructions !== undefined) {
        acceptance.generation.regeneration = { sourceMessageId: assistantMessageId, instructions };
        completed.generation.regeneration = { sourceMessageId: assistantMessageId, instructions };
      }
      const regenerate = vi.fn<ThreadMessagingTurns["regenerate"]>(() =>
        Effect.succeed({
          acceptance: toGenerationAcceptance(acceptance),
          cancel: Effect.void,
          settlement: Effect.succeed(completed),
        }),
      );
      const backendTurns = createBackendTurnsStub({ regenerate });

      exposeSingleRenderer(activeTarget(), backendTurns, { report: vi.fn() });
      const accepted = await requireImplementations().turns.regenerate({
        assistantMessageId,
        ...(instructions !== undefined && { instructions }),
        configuration: {
          model: { providerId: "openrouter", modelId: "maker/model" },
          reasoningPreset: ReasoningPreset.High,
        },
      });

      expect(regenerate).toHaveBeenCalledWith({
        assistantMessageId,
        ...(instructions !== undefined && { instructions }),
        configuration: {
          model: { providerId: "openrouter", modelId: "maker/model" },
          reasoningPreset: "high",
        },
      });
      expect(accepted).toEqual(
        expect.objectContaining({
          id: acceptance.generation.id,
          intent: GenerationIntent.Regeneration,
          status: "pending",
          reasoning: {
            preset: ReasoningPreset.High,
            source: ReasoningPresetSource.Selection,
          },
        }),
      );
      await vi.waitFor(() => expect(implementations.dispatchReplyCompleted).toHaveBeenCalledOnce());
      expect(accepted.regeneration).toEqual(acceptance.generation.regeneration);
      if (instructions !== undefined) {
        expect(implementations.dispatchReplyCompleted).toHaveBeenCalledWith(
          expect.objectContaining({
            generation: expect.objectContaining({
              regeneration: acceptance.generation.regeneration,
            }),
          }),
        );
      }
    },
  );

  it("transports opening acceptance and completion with no player turn", async () => {
    const { acceptance, completed } = createTurnState("regeneration");
    const sourceMessage = {
      ...completed.assistantMessage,
      id: ids.message.create(),
      turnId: null,
      parentMessageId: null,
      content: "Someone knocks.",
    };
    const generation = {
      ...acceptance.generation,
      turnId: null,
      regeneration: { sourceMessageId: sourceMessage.id },
    };
    const settled = {
      ...completed,
      sourceMessage,
      assistantMessage: { ...completed.assistantMessage, turnId: null, parentMessageId: null },
      generation: { ...completed.generation, turnId: null, regeneration: generation.regeneration },
      threadActivity: { ...completed.threadActivity, turnCount: 0 },
    };
    const regenerate = vi.fn<ThreadMessagingTurns["regenerate"]>(() =>
      Effect.succeed({
        acceptance: { sourceMessage, generation, threadActivity: settled.threadActivity },
        cancel: Effect.void,
        settlement: Effect.succeed(settled),
      }),
    );
    exposeSingleRenderer(activeTarget(), createBackendTurnsStub({ regenerate }), {
      report: vi.fn(),
    });
    const accepted = await requireImplementations().turns.regenerate({
      assistantMessageId: sourceMessage.id,
      configuration: { model: { providerId: "openrouter", modelId: "maker/model" } },
    });
    expect(accepted).toMatchObject({
      threadId: sourceMessage.threadId,
      turnId: null,
      regeneration: { sourceMessageId: sourceMessage.id },
    });
    await vi.waitFor(() => expect(implementations.dispatchReplyCompleted).toHaveBeenCalledOnce());
    expect(implementations.dispatchReplyCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMessage: expect.objectContaining({
          id: sourceMessage.id,
          author: "assistant",
          turnId: null,
        }),
        assistantMessage: expect.objectContaining({ turnId: null }),
        generation: expect.objectContaining({ threadId: sourceMessage.threadId, turnId: null }),
        threadActivity: expect.objectContaining({ turnCount: 0 }),
      }),
    );
  });

  it("labels unexpected regeneration failures as regeneration operations", async () => {
    const cause = new Error("Reply preparation failed");
    const failed = failedSettlement("preparation", cause, "regeneration");
    const acceptance: TurnAcceptance = {
      userMessage: failed.sourceMessage,
      generation: { ...failed.generation, status: "pending", failureKind: null, finishedAt: null },
      threadActivity: failed.threadActivity,
    };
    const regenerate = vi.fn<ThreadMessagingTurns["regenerate"]>(() =>
      Effect.succeed({
        acceptance: toGenerationAcceptance(acceptance),
        cancel: Effect.void,
        settlement: Effect.succeed(failed),
      }),
    );
    const backendTurns = createBackendTurnsStub({ regenerate });
    const report = vi.fn<ErrorReporter["report"]>();

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.regenerate({
      assistantMessageId: ids.message.create(),
      configuration: { model: { providerId: "openrouter", modelId: "maker/model" } },
    });

    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "thread.reply.regenerate" }),
    );
  });

  it("reports a rejected settlement observer without dispatching incomplete state", async () => {
    const { acceptance } = createTurnState();
    const cause = new Error("Settlement ownership failed");
    const backendTurns = createBackendTurnsStub({
      submit: vi.fn(() =>
        Effect.succeed({ acceptance, cancel: Effect.void, settlement: Effect.fail(cause) }),
      ),
    });
    const report = vi.fn<ErrorReporter["report"]>();

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: acceptance.userMessage.threadId,
      content: "Hello",
      configuration: { model: { providerId: "openrouter", modelId: "maker/model" } },
    });

    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    expect(report).toHaveBeenCalledWith({
      severity: ErrorSeverity.Error,
      operation: "thread.turn.submit",
      error: expect.objectContaining({ message: "An accepted turn could not settle.", cause }),
    });
    expect(implementations.dispatchReplyFailed).not.toHaveBeenCalled();
    expect(implementations.dispatchReplyCompleted).not.toHaveBeenCalled();
    expect(implementations.dispatchReplySuperseded).not.toHaveBeenCalled();
  });

  it("does not diagnose interruption as an application failure", async () => {
    const interrupted = failedSettlement("interrupted", new Error("Backend is closing"));
    const acceptance: TurnAcceptance = {
      userMessage: interrupted.sourceMessage,
      generation: {
        ...interrupted.generation,
        status: "pending",
        failureKind: null,
        finishedAt: null,
      },
      threadActivity: interrupted.threadActivity,
    };
    const backendTurns = createBackendTurnsStub({
      submit: vi.fn(() =>
        Effect.succeed({
          acceptance,
          cancel: Effect.void,
          settlement: Effect.succeed(interrupted),
        }),
      ),
    });
    const report = vi.fn<ErrorReporter["report"]>();

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: interrupted.sourceMessage.threadId,
      content: "Hello",
      configuration: { model: { providerId: "openrouter", modelId: "maker/model" } },
    });

    await vi.waitFor(() => expect(implementations.dispatchReplyFailed).toHaveBeenCalledOnce());
    expect(report).not.toHaveBeenCalled();
  });

  it("does not dispatch settlement state to a destroyed renderer", async () => {
    const { acceptance, completed } = createTurnState();
    const backendTurns = createBackendTurnsStub({
      submit: vi.fn(() =>
        Effect.succeed({ acceptance, cancel: Effect.void, settlement: Effect.succeed(completed) }),
      ),
    });
    const target = {
      detached: false,
      isDestroyed: () => true,
    } as WebFrameMain;
    const report = vi.fn<ErrorReporter["report"]>();

    exposeSingleRenderer(target, backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: acceptance.userMessage.threadId,
      content: "Hello",
      configuration: { model: { providerId: "openrouter", modelId: "maker/model" } },
    });

    expect(implementations.dispatchReplyFailed).not.toHaveBeenCalled();
    expect(implementations.dispatchReplyCompleted).not.toHaveBeenCalled();
    expect(implementations.dispatchReplySuperseded).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("delivers an in-flight settlement to a replacement renderer", async () => {
    const { acceptance, completed } = createTurnState();
    let settle!: (settlement: GenerationSettlement) => void;
    const settlement = new Promise<GenerationSettlement>((resolve) => {
      settle = resolve;
    });
    const backendTurns = createBackendTurnsStub({
      submit: vi.fn(() =>
        Effect.succeed({
          acceptance,
          settlement: Effect.promise(() => settlement),
          cancel: Effect.void,
        }),
      ),
    });
    const report = vi.fn<ErrorReporter["report"]>();
    const messaging = createThreadMessaging(
      createBackendThreadsStub(),
      backendTurns,
      { report },
      Effect,
    );
    const stopSubmittingRenderer = messaging.expose(activeTarget());

    await requireImplementations().turns.submit({
      threadId: acceptance.userMessage.threadId,
      content: "Hello",
      configuration: { model: { providerId: "openrouter", modelId: "maker/model" } },
    });
    stopSubmittingRenderer();
    messaging.expose(activeTarget());
    settle(completed);

    await vi.waitFor(() => expect(implementations.dispatchReplyCompleted).toHaveBeenCalledOnce());
    expect(report).not.toHaveBeenCalled();
  });

  it("reports settlement dispatch failures for an active renderer", async () => {
    const { acceptance, completed } = createTurnState();
    const backendTurns = createBackendTurnsStub({
      submit: vi.fn(() =>
        Effect.succeed({ acceptance, cancel: Effect.void, settlement: Effect.succeed(completed) }),
      ),
    });
    const cause = new Error("IPC send failed");
    const report = vi.fn<ErrorReporter["report"]>();
    implementations.dispatchReplyCompleted.mockImplementationOnce(() => {
      throw cause;
    });

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: acceptance.userMessage.threadId,
      content: "Hello",
      configuration: { model: { providerId: "openrouter", modelId: "maker/model" } },
    });

    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    expect(report).toHaveBeenCalledWith({
      severity: ErrorSeverity.Error,
      operation: "thread.turn.submit.dispatch",
      error: expect.objectContaining({ message: "Could not publish thread state.", cause }),
    });
  });

  it("deletes history through typed identities and publishes the committed change", async () => {
    const threadId = ids.thread.create();
    const userMessageId = ids.message.create();
    const activeMessageId = ids.message.create();
    const deleteFrom = vi.fn<ThreadMessagingTurns["deleteFrom"]>(() => ({
      threadId,
      userMessageId,
      activeMessageId,
      deletedTurnCount: 3,
      threadActivity: { threadId, lastActivityAt: 700, turnCount: 4 },
    }));
    const backendTurns = createBackendTurnsStub({ deleteFrom });

    exposeSingleRenderer(activeTarget(), backendTurns, { report: vi.fn() });
    const result = await requireImplementations().turns.deleteFrom({ threadId, userMessageId });

    expect(deleteFrom).toHaveBeenCalledWith({ threadId, userMessageId });
    expect(result).toEqual({
      threadId,
      userMessageId,
      activeMessageId,
      deletedTurnCount: 3,
      threadActivity: { threadId, lastActivityAt: 700, turnCount: 4 },
    });
    expect(implementations.dispatchHistoryDeleted).toHaveBeenCalledWith(result);
  });

  it("edits a message through its typed identity and publishes the committed message", async () => {
    const { acceptance } = createTurnState();
    const editedMessage = { ...acceptance.userMessage, content: "Edited message" };
    const editMessage = vi.fn<ThreadMessagingTurns["editMessage"]>(() => editedMessage);
    const backendTurns = createBackendTurnsStub({ editMessage });

    exposeSingleRenderer(activeTarget(), backendTurns, { report: vi.fn() });
    const result = await requireImplementations().turns.editMessage({
      messageId: editedMessage.id,
      content: editedMessage.content,
    });

    expect(editMessage).toHaveBeenCalledWith({
      messageId: editedMessage.id,
      content: editedMessage.content,
    });
    expect(result).toEqual({
      id: editedMessage.id,
      threadId: editedMessage.threadId,
      turnId: editedMessage.turnId,
      sequence: editedMessage.sequence,
      author: "user",
      content: editedMessage.content,
      createdAt: editedMessage.createdAt,
    });
    expect(implementations.dispatchMessageEdited).toHaveBeenCalledWith(result);
  });

  it("rejects malformed TypeIDs at the adapter boundary", async () => {
    const getTranscript = vi.fn<ThreadMessagingThreads["getTranscript"]>();
    const listForThread = vi.fn(emptyPage);
    const regenerate = vi.fn();
    const submit = vi.fn();
    const retry = vi.fn();
    const deleteFrom = vi.fn<ThreadMessagingTurns["deleteFrom"]>();
    const editMessage = vi.fn<ThreadMessagingTurns["editMessage"]>();
    const backendTurns = createBackendTurnsStub({
      deleteFrom,
      editMessage,
      listForThread,
      regenerate,
      submit,
      retry,
    });
    exposeSingleRenderer(
      activeTarget(),
      backendTurns,
      { report: vi.fn() },
      createBackendThreadsStub({ getTranscript }),
    );
    const ipc = requireImplementations();
    const configuration = {
      model: { providerId: "openrouter", modelId: "maker/model" },
    };

    expect(() =>
      ipc.threads.listMessages({
        threadId: "invalid",
        direction: ThreadMessagePageDirection.Older,
      }),
    ).toThrow(TypeError);
    expect(() => ipc.threads.getTranscript("invalid")).toThrow(TypeError);
    await expect(
      ipc.turns.submit({ threadId: "invalid", content: "Hello", configuration }),
    ).rejects.toThrow(TypeError);
    await expect(ipc.turns.retry({ turnId: "invalid", configuration })).rejects.toThrow(TypeError);
    await expect(
      ipc.turns.regenerate({ assistantMessageId: "invalid", configuration }),
    ).rejects.toThrow(TypeError);
    expect(() => ipc.turns.editMessage({ messageId: "invalid", content: "Edited" })).toThrow(
      TypeError,
    );
    expect(() =>
      ipc.turns.deleteFrom({ threadId: "invalid", userMessageId: ids.message.create() }),
    ).toThrow(TypeError);
    expect(() =>
      ipc.turns.deleteFrom({ threadId: ids.thread.create(), userMessageId: "invalid" }),
    ).toThrow(TypeError);
    expect(listForThread).not.toHaveBeenCalled();
    expect(getTranscript).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
    expect(regenerate).not.toHaveBeenCalled();
    expect(editMessage).not.toHaveBeenCalled();
    expect(deleteFrom).not.toHaveBeenCalled();
  });
});
