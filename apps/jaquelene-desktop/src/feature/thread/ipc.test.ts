import type { Generation, TurnAcceptance, TurnSettlement, Turns } from "@jaquelene/backend";
import { ids } from "@jaquelene/backend";
import { ErrorSeverity, type ErrorReporter } from "@jaquelene/diagnostics";
import type {
  CompletedReply as IpcCompletedReply,
  FailedReply as IpcFailedReply,
  IThreadsImpl,
  ITurnsImpl,
  SupersededReply as IpcSupersededReply,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

type CompletedTurnSettlement = Extract<TurnSettlement, { outcome: "completed" }>;
type FailedTurnSettlement = Extract<TurnSettlement, { outcome: "failed" }>;

const implementations = vi.hoisted(() => ({
  threads: undefined as IThreadsImpl | undefined,
  turns: undefined as ITurnsImpl | undefined,
  dispatchReplyFailed: vi.fn<(failure: IpcFailedReply) => void>(),
  dispatchReplyCompleted: vi.fn<(completion: IpcCompletedReply) => void>(),
  dispatchReplySuperseded: vi.fn<(reply: IpcSupersededReply) => void>(),
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
  ThreadMessageAuthor: { User: "user", Assistant: "assistant" },
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
        };
      },
    }),
  },
}));

import { createThreadMessaging } from "./ipc";

function exposeSingleRenderer(target: WebFrameMain, turns: Turns, diagnostics: ErrorReporter) {
  return createThreadMessaging(turns, diagnostics).expose(target);
}

function requireImplementations() {
  if (!implementations.threads || !implementations.turns) {
    throw new Error("Thread IPC implementations were not registered.");
  }

  return { threads: implementations.threads, turns: implementations.turns };
}

function createTurnState() {
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
    id: ids.generation.create(),
    turnId,
    providerId: "openrouter",
    modelId: "maker/model",
    status: "pending",
    failureKind: null,
    providerGenerationId: null,
    resolvedModelId: null,
    finishReason: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    outputMessageId: null,
    startedAt: 101,
    finishedAt: null,
  };
  const acceptance: TurnAcceptance = { userMessage, generation: pendingGeneration };
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
  const completed: CompletedTurnSettlement = {
    ...acceptance,
    outcome: "completed",
    generation: {
      ...pendingGeneration,
      status: "completed",
      outputMessageId: assistantMessageId,
      finishedAt: 102,
    },
    assistantMessage,
    assistantActivated: true,
  };

  return { acceptance, completed };
}

function failedSettlement(
  failureKind: NonNullable<Generation["failureKind"]>,
  cause: unknown,
): FailedTurnSettlement {
  const { acceptance } = createTurnState();

  return {
    ...acceptance,
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
});

describe("thread IPC", () => {
  it("returns pending acceptance and dispatches committed settlement separately", async () => {
    const { acceptance, completed } = createTurnState();
    let settle!: (settlement: TurnSettlement) => void;
    const settlement = new Promise<TurnSettlement>((resolve) => {
      settle = resolve;
    });
    const listForThread = vi.fn<Turns["listForThread"]>(() => ({
      ...emptyPage(),
      messages: [acceptance.userMessage],
      generations: [acceptance.generation],
      contentBytes: 5,
    }));
    const submit = vi.fn<Turns["submit"]>(() => ({ acceptance, settlement }));
    const backendTurns: Turns = {
      listForThread,
      submit,
      retry: vi.fn(() => ({ acceptance, settlement })),
    };
    const report = vi.fn<ErrorReporter["report"]>();

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    const ipc = requireImplementations();
    const page = await ipc.threads.listMessages({ threadId: acceptance.userMessage.threadId });
    const model = { providerId: "openrouter", modelId: "maker/model" };
    const submitted = await ipc.turns.submit({
      threadId: acceptance.userMessage.threadId,
      content: "Hello",
      model,
    });

    expect(listForThread).toHaveBeenCalledWith({
      threadId: acceptance.userMessage.threadId,
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
          turnId: acceptance.userMessage.turnId,
          providerId: "openrouter",
          modelId: "maker/model",
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
      model,
    });
    expect(submitted).toEqual({
      userMessage: page.messages[0],
      generation: expect.objectContaining({ status: "pending" }),
    });
    expect(implementations.dispatchReplyCompleted).not.toHaveBeenCalled();

    settle(completed);
    await vi.waitFor(() => expect(implementations.dispatchReplyCompleted).toHaveBeenCalledOnce());

    expect(implementations.dispatchReplyCompleted).toHaveBeenCalledWith({
      userMessage: page.messages[0],
      generation: expect.objectContaining({
        id: completed.generation.id,
        status: "completed",
        outputMessageId: completed.assistantMessage.id,
      }),
      assistantMessage: expect.objectContaining({ content: "Hi" }),
    });
    expect(report).not.toHaveBeenCalled();
  });

  it("publishes a superseded reply when its completion is not active", async () => {
    const { acceptance, completed } = createTurnState();
    const inactiveCompletion: CompletedTurnSettlement = {
      ...completed,
      assistantActivated: false,
    };
    const backendTurns: Turns = {
      listForThread: vi.fn(emptyPage),
      submit: vi.fn(() => ({ acceptance, settlement: Promise.resolve(inactiveCompletion) })),
      retry: vi.fn(),
    };
    const report = vi.fn<ErrorReporter["report"]>();

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: acceptance.userMessage.threadId,
      content: "Hello",
      model: { providerId: "openrouter", modelId: "maker/model" },
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
      userMessage: failed.userMessage,
      generation: { ...failed.generation, status: "pending", failureKind: null, finishedAt: null },
    };
    const backendTurns: Turns = {
      listForThread: vi.fn(emptyPage),
      submit: vi.fn(() => ({ acceptance, settlement: Promise.resolve(failed) })),
      retry: vi.fn(),
    };
    const report = vi.fn<ErrorReporter["report"]>();

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: failed.userMessage.threadId,
      content: "Hello",
      model: { providerId: "openrouter", modelId: "maker/model" },
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
    const failed = failedSettlement("preparation", cause);
    const acceptance: TurnAcceptance = {
      userMessage: failed.userMessage,
      generation: { ...failed.generation, status: "pending", failureKind: null, finishedAt: null },
    };
    const retry = vi.fn<Turns["retry"]>(() => ({
      acceptance,
      settlement: Promise.resolve(failed),
    }));
    const backendTurns: Turns = {
      listForThread: vi.fn(emptyPage),
      submit: vi.fn(),
      retry,
    };
    const report = vi.fn<ErrorReporter["report"]>();
    const model = { providerId: "openrouter", modelId: "maker/model" };

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    const accepted = await requireImplementations().turns.retry({
      turnId: failed.userMessage.turnId,
      model,
    });

    expect(retry).toHaveBeenCalledWith({
      turnId: failed.userMessage.turnId,
      model,
    });
    expect(accepted.status).toBe("pending");
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "thread.turn.retry" }),
    );
  });

  it("reports a rejected settlement observer without dispatching incomplete state", async () => {
    const { acceptance } = createTurnState();
    const cause = new Error("Settlement ownership failed");
    const backendTurns: Turns = {
      listForThread: vi.fn(emptyPage),
      submit: vi.fn(() => ({ acceptance, settlement: Promise.reject(cause) })),
      retry: vi.fn(),
    };
    const report = vi.fn<ErrorReporter["report"]>();

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: acceptance.userMessage.threadId,
      content: "Hello",
      model: { providerId: "openrouter", modelId: "maker/model" },
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
      userMessage: interrupted.userMessage,
      generation: {
        ...interrupted.generation,
        status: "pending",
        failureKind: null,
        finishedAt: null,
      },
    };
    const backendTurns: Turns = {
      listForThread: vi.fn(emptyPage),
      submit: vi.fn(() => ({ acceptance, settlement: Promise.resolve(interrupted) })),
      retry: vi.fn(),
    };
    const report = vi.fn<ErrorReporter["report"]>();

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: interrupted.userMessage.threadId,
      content: "Hello",
      model: { providerId: "openrouter", modelId: "maker/model" },
    });

    await vi.waitFor(() => expect(implementations.dispatchReplyFailed).toHaveBeenCalledOnce());
    expect(report).not.toHaveBeenCalled();
  });

  it("does not dispatch settlement state to a destroyed renderer", async () => {
    const { acceptance, completed } = createTurnState();
    const backendTurns: Turns = {
      listForThread: vi.fn(emptyPage),
      submit: vi.fn(() => ({ acceptance, settlement: Promise.resolve(completed) })),
      retry: vi.fn(),
    };
    const target = {
      detached: false,
      isDestroyed: () => true,
    } as WebFrameMain;
    const report = vi.fn<ErrorReporter["report"]>();

    exposeSingleRenderer(target, backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: acceptance.userMessage.threadId,
      content: "Hello",
      model: { providerId: "openrouter", modelId: "maker/model" },
    });

    expect(implementations.dispatchReplyFailed).not.toHaveBeenCalled();
    expect(implementations.dispatchReplyCompleted).not.toHaveBeenCalled();
    expect(implementations.dispatchReplySuperseded).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("delivers an in-flight settlement to a replacement renderer", async () => {
    const { acceptance, completed } = createTurnState();
    let settle!: (settlement: TurnSettlement) => void;
    const settlement = new Promise<TurnSettlement>((resolve) => {
      settle = resolve;
    });
    const backendTurns: Turns = {
      listForThread: vi.fn(emptyPage),
      submit: vi.fn(() => ({ acceptance, settlement })),
      retry: vi.fn(),
    };
    const report = vi.fn<ErrorReporter["report"]>();
    const messaging = createThreadMessaging(backendTurns, { report });
    const stopSubmittingRenderer = messaging.expose(activeTarget());

    await requireImplementations().turns.submit({
      threadId: acceptance.userMessage.threadId,
      content: "Hello",
      model: { providerId: "openrouter", modelId: "maker/model" },
    });
    stopSubmittingRenderer();
    messaging.expose(activeTarget());
    settle(completed);

    await vi.waitFor(() => expect(implementations.dispatchReplyCompleted).toHaveBeenCalledOnce());
    expect(report).not.toHaveBeenCalled();
  });

  it("reports settlement dispatch failures for an active renderer", async () => {
    const { acceptance, completed } = createTurnState();
    const backendTurns: Turns = {
      listForThread: vi.fn(emptyPage),
      submit: vi.fn(() => ({ acceptance, settlement: Promise.resolve(completed) })),
      retry: vi.fn(),
    };
    const cause = new Error("IPC send failed");
    const report = vi.fn<ErrorReporter["report"]>();
    implementations.dispatchReplyCompleted.mockImplementationOnce(() => {
      throw cause;
    });

    exposeSingleRenderer(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: acceptance.userMessage.threadId,
      content: "Hello",
      model: { providerId: "openrouter", modelId: "maker/model" },
    });

    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    expect(report).toHaveBeenCalledWith({
      severity: ErrorSeverity.Error,
      operation: "thread.turn.submit.dispatch",
      error: expect.objectContaining({ message: "Could not publish turn state.", cause }),
    });
  });

  it("rejects malformed TypeIDs at the adapter boundary", () => {
    const listForThread = vi.fn(emptyPage);
    const submit = vi.fn();
    const retry = vi.fn();
    const backendTurns: Turns = { listForThread, submit, retry };
    exposeSingleRenderer(activeTarget(), backendTurns, { report: vi.fn() });
    const ipc = requireImplementations();
    const model = { providerId: "openrouter", modelId: "maker/model" };

    expect(() => ipc.threads.listMessages({ threadId: "invalid" })).toThrow(TypeError);
    expect(() => ipc.turns.submit({ threadId: "invalid", content: "Hello", model })).toThrow(
      TypeError,
    );
    expect(() => ipc.turns.retry({ turnId: "invalid", model })).toThrow(TypeError);
    expect(listForThread).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });
});
