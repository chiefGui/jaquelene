import type { Generation, TurnAcceptance, TurnSettlement, Turns } from "@jaquelene/backend";
import { ids } from "@jaquelene/backend";
import { ErrorSeverity, type ErrorReporter } from "@jaquelene/diagnostics";
import type {
  IThreadsImpl,
  ITurnsImpl,
  TurnSettlement as IpcTurnSettlement,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const implementations = vi.hoisted(() => ({
  threads: undefined as IThreadsImpl | undefined,
  turns: undefined as ITurnsImpl | undefined,
  dispatchSettled: vi.fn<(settlement: IpcTurnSettlement) => void>(),
}));

vi.mock("@jaquelene/ipc/main", () => ({
  GenerationFailureKind: {
    Prompt: "prompt",
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
        return { dispatchSettled: implementations.dispatchSettled };
      },
    }),
  },
}));

import { exposeThreadMessaging } from "./ipc";

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
  const turn = { id: turnId, threadId, createdAt: 100 };
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
  const acceptance: TurnAcceptance = { turn, userMessage, generation: pendingGeneration };
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
  const completed: TurnSettlement = {
    ...acceptance,
    generation: {
      ...pendingGeneration,
      status: "completed",
      outputMessageId: assistantMessageId,
      finishedAt: 102,
    },
    assistantMessage,
    assistantActivated: true,
    failure: null,
  };

  return { acceptance, completed };
}

function failedSettlement(
  failureKind: NonNullable<Generation["failureKind"]>,
  cause: unknown,
): TurnSettlement {
  const { acceptance } = createTurnState();

  return {
    ...acceptance,
    generation: {
      ...acceptance.generation,
      status: "failed",
      failureKind,
      finishedAt: 102,
    },
    assistantMessage: null,
    assistantActivated: false,
    failure: { cause },
  };
}

function emptyPage() {
  return {
    messages: [],
    generations: [],
    pageSize: 50,
    messageContentMaxLength: 100_000,
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
  implementations.dispatchSettled.mockClear();
});

describe("thread IPC", () => {
  it("returns pending acceptance and dispatches committed settlement separately", async () => {
    const { acceptance, completed } = createTurnState();
    let settle!: (settlement: TurnSettlement) => void;
    const settlement = new Promise<TurnSettlement>((resolve) => {
      settle = resolve;
    });
    const backendTurns: Turns = {
      listForThread: vi.fn(() => ({
        ...emptyPage(),
        messages: [acceptance.userMessage],
        generations: [acceptance.generation],
      })),
      submit: vi.fn(() => ({ acceptance, settlement })),
      retry: vi.fn(() => ({ acceptance, settlement })),
    };
    const report = vi.fn<ErrorReporter["report"]>();

    exposeThreadMessaging(activeTarget(), backendTurns, { report });
    const ipc = requireImplementations();
    const page = await ipc.threads.listMessages({ threadId: acceptance.turn.threadId });
    const model = { providerId: "openrouter", modelId: "maker/model" };
    const submitted = await ipc.turns.submit({
      threadId: acceptance.turn.threadId,
      content: "Hello",
      model,
    });

    expect(backendTurns.listForThread).toHaveBeenCalledWith({
      threadId: acceptance.turn.threadId,
    });
    expect(page).toEqual({
      messages: [
        {
          id: acceptance.userMessage.id,
          threadId: acceptance.turn.threadId,
          turnId: acceptance.turn.id,
          sequence: 1,
          author: "user",
          content: "Hello",
          createdAt: 100,
        },
      ],
      generations: [
        {
          id: acceptance.generation.id,
          turnId: acceptance.turn.id,
          providerId: "openrouter",
          modelId: "maker/model",
          status: "pending",
          startedAt: 101,
        },
      ],
      pageSize: 50,
      messageContentMaxLength: 100_000,
    });
    expect(backendTurns.submit).toHaveBeenCalledWith({
      threadId: acceptance.turn.threadId,
      content: "Hello",
      model,
    });
    expect(submitted).toEqual({
      turn: acceptance.turn,
      userMessage: page.messages[0],
      generation: expect.objectContaining({ status: "pending" }),
    });
    expect(implementations.dispatchSettled).not.toHaveBeenCalled();

    settle(completed);
    await vi.waitFor(() => expect(implementations.dispatchSettled).toHaveBeenCalledOnce());

    expect(implementations.dispatchSettled).toHaveBeenCalledWith({
      turn: completed.turn,
      userMessage: page.messages[0],
      generation: expect.objectContaining({
        id: completed.generation.id,
        status: "completed",
        outputMessageId: completed.assistantMessage?.id,
      }),
      assistantMessage: expect.objectContaining({ content: "Hi" }),
      assistantActivated: true,
    });
    expect(report).not.toHaveBeenCalled();
  });

  it.each([
    ["prompt", "prompt compilation"],
    ["invalid-output", "provider output validation"],
    ["storage", "reply storage"],
  ] as const)("reports durable %s failures after acceptance", async (failureKind, stage) => {
    const cause = new Error(`${failureKind} failed`);
    const failed = failedSettlement(failureKind, cause);
    const acceptance: TurnAcceptance = {
      turn: failed.turn,
      userMessage: failed.userMessage,
      generation: { ...failed.generation, status: "pending", failureKind: null, finishedAt: null },
    };
    const backendTurns: Turns = {
      listForThread: vi.fn(emptyPage),
      submit: vi.fn(() => ({ acceptance, settlement: Promise.resolve(failed) })),
      retry: vi.fn(),
    };
    const report = vi.fn<ErrorReporter["report"]>();

    exposeThreadMessaging(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: failed.turn.threadId,
      content: "Hello",
      model: { providerId: "openrouter", modelId: "maker/model" },
    });

    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    expect(report).toHaveBeenCalledWith({
      severity: ErrorSeverity.Error,
      operation: "thread.turn.submit",
      error: expect.objectContaining({ message: `Generation failed during ${stage}.`, cause }),
    });
    expect(implementations.dispatchSettled).toHaveBeenCalledOnce();
  });

  it("labels unexpected retry failures as retry operations", async () => {
    const cause = new Error("Prompt compilation failed");
    const failed = failedSettlement("prompt", cause);
    const acceptance: TurnAcceptance = {
      turn: failed.turn,
      userMessage: failed.userMessage,
      generation: { ...failed.generation, status: "pending", failureKind: null, finishedAt: null },
    };
    const backendTurns: Turns = {
      listForThread: vi.fn(emptyPage),
      submit: vi.fn(),
      retry: vi.fn(() => ({ acceptance, settlement: Promise.resolve(failed) })),
    };
    const report = vi.fn<ErrorReporter["report"]>();
    const model = { providerId: "openrouter", modelId: "maker/model" };

    exposeThreadMessaging(activeTarget(), backendTurns, { report });
    const accepted = await requireImplementations().turns.retry({
      turnId: failed.turn.id,
      model,
    });

    expect(backendTurns.retry).toHaveBeenCalledWith({ turnId: failed.turn.id, model });
    expect(accepted.generation.status).toBe("pending");
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

    exposeThreadMessaging(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: acceptance.turn.threadId,
      content: "Hello",
      model: { providerId: "openrouter", modelId: "maker/model" },
    });

    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    expect(report).toHaveBeenCalledWith({
      severity: ErrorSeverity.Error,
      operation: "thread.turn.submit",
      error: expect.objectContaining({ message: "An accepted turn could not settle.", cause }),
    });
    expect(implementations.dispatchSettled).not.toHaveBeenCalled();
  });

  it("does not diagnose interruption as an application failure", async () => {
    const interrupted = failedSettlement("interrupted", new Error("Backend is closing"));
    const acceptance: TurnAcceptance = {
      turn: interrupted.turn,
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

    exposeThreadMessaging(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: interrupted.turn.threadId,
      content: "Hello",
      model: { providerId: "openrouter", modelId: "maker/model" },
    });

    await vi.waitFor(() => expect(implementations.dispatchSettled).toHaveBeenCalledOnce());
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

    exposeThreadMessaging(target, backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: acceptance.turn.threadId,
      content: "Hello",
      model: { providerId: "openrouter", modelId: "maker/model" },
    });

    expect(implementations.dispatchSettled).not.toHaveBeenCalled();
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
    implementations.dispatchSettled.mockImplementationOnce(() => {
      throw cause;
    });

    exposeThreadMessaging(activeTarget(), backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: acceptance.turn.threadId,
      content: "Hello",
      model: { providerId: "openrouter", modelId: "maker/model" },
    });

    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    expect(report).toHaveBeenCalledWith({
      severity: ErrorSeverity.Error,
      operation: "thread.turn.submit.dispatch",
      error: expect.objectContaining({ message: "Could not publish settled turn state.", cause }),
    });
  });

  it("rejects malformed TypeIDs at the adapter boundary", () => {
    const backendTurns: Turns = {
      listForThread: vi.fn(emptyPage),
      submit: vi.fn(),
      retry: vi.fn(),
    };
    exposeThreadMessaging(activeTarget(), backendTurns, { report: vi.fn() });
    const ipc = requireImplementations();
    const model = { providerId: "openrouter", modelId: "maker/model" };

    expect(() => ipc.threads.listMessages({ threadId: "invalid" })).toThrow(TypeError);
    expect(() => ipc.turns.submit({ threadId: "invalid", content: "Hello", model })).toThrow(
      TypeError,
    );
    expect(() => ipc.turns.retry({ turnId: "invalid", model })).toThrow(TypeError);
    expect(backendTurns.listForThread).not.toHaveBeenCalled();
    expect(backendTurns.submit).not.toHaveBeenCalled();
    expect(backendTurns.retry).not.toHaveBeenCalled();
  });
});
