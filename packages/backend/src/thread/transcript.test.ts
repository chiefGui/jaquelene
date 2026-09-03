import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { ThreadTranscriptEntryKind } from "@jaquelene/domain";
import { createCampaigns } from "#backend/campaign/campaigns";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import { createModelInputComposer } from "#backend/model/input-composer";
import {
  jaqueleneNarratorPromptDefinition,
  narratorPromptKind,
  narratorPromptModule,
} from "#backend/narrator/module";
import { createPromptSubsystem } from "#backend/prompt/subsystem";
import { createThreadTranscriptReader } from "./transcript";
import {
  appendAssistantMessageInTransaction,
  createThreads,
  THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
  THREAD_MESSAGE_PAGE_MAX_COUNT,
} from "./threads";

const directories: string[] = [];
const databases: Database[] = [];

function openTranscriptEnvironment(now: () => number = Date.now) {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-transcript-"));
  directories.push(directory);
  const database = openDatabase(join(directory, "jaquelene.sqlite"));
  databases.push(database);
  const { applications } = createPromptSubsystem(database, [narratorPromptModule]);
  const campaigns = createCampaigns(database, now);
  const threads = createThreads(database, now);
  const transcripts = createThreadTranscriptReader(
    threads,
    createModelInputComposer(campaigns, applications),
  );

  return { campaigns, database, threads, transcripts };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("thread transcripts", () => {
  it("projects instructions and only the active dialogue branch in submission order", () => {
    let timestamp = 100;
    const { campaigns, database, threads, transcripts } = openTranscriptEnvironment(
      () => timestamp++,
    );
    const campaign = campaigns.start({
      title: "The Long Night",
      composition: [{ kind: narratorPromptKind.key }],
    });
    const first = threads.startTurn(campaign.threadId, "Begin");
    const firstReply = database.transaction((transaction) =>
      appendAssistantMessageInTransaction(transaction, {
        threadId: campaign.threadId,
        turnId: first.turn.id,
        parentMessageId: first.message.id,
        activateIfMessageId: first.message.id,
        content: "The road opens ahead.",
        createdAt: timestamp++,
      }),
    );
    const second = threads.startTurn(campaign.threadId, "Continue");
    const inactiveReply = database.transaction((transaction) =>
      appendAssistantMessageInTransaction(transaction, {
        threadId: campaign.threadId,
        turnId: first.turn.id,
        parentMessageId: first.message.id,
        activateIfMessageId: ids.message.create(),
        content: "An inactive branch.",
        createdAt: timestamp++,
      }),
    );

    expect(inactiveReply.threadActivity).toBeNull();
    expect(transcripts.get(campaign.threadId)).toEqual({
      threadId: campaign.threadId,
      entries: [
        {
          kind: ThreadTranscriptEntryKind.Instruction,
          sourceKey: jaqueleneNarratorPromptDefinition.key,
          content: jaqueleneNarratorPromptDefinition.body,
        },
        {
          kind: ThreadTranscriptEntryKind.Message,
          messageId: first.message.id,
          author: "user",
          content: "Begin",
        },
        {
          kind: ThreadTranscriptEntryKind.Message,
          messageId: firstReply.message.id,
          author: "assistant",
          content: "The road opens ahead.",
        },
        {
          kind: ThreadTranscriptEntryKind.Message,
          messageId: second.message.id,
          author: "user",
          content: "Continue",
        },
      ],
    });

    threads.deleteFrom({ threadId: campaign.threadId, userMessageId: second.message.id });

    expect(
      transcripts.get(campaign.threadId).entries.map(({ kind, content }) => ({ kind, content })),
    ).toEqual([
      {
        kind: ThreadTranscriptEntryKind.Instruction,
        content: jaqueleneNarratorPromptDefinition.body,
      },
      { kind: ThreadTranscriptEntryKind.Message, content: "Begin" },
      { kind: ThreadTranscriptEntryKind.Message, content: "The road opens ahead." },
    ]);
  });

  it("supports empty and standalone threads while rejecting unknown identities", () => {
    const { threads, transcripts } = openTranscriptEnvironment();
    const emptyThread = threads.create();
    const standaloneThread = threads.create();
    const started = threads.startTurn(standaloneThread.id, "Hello");

    expect(transcripts.get(emptyThread.id)).toEqual({ threadId: emptyThread.id, entries: [] });
    expect(transcripts.get(standaloneThread.id)).toEqual({
      threadId: standaloneThread.id,
      entries: [
        {
          kind: ThreadTranscriptEntryKind.Message,
          messageId: started.message.id,
          author: "user",
          content: "Hello",
        },
      ],
    });
    const missingThreadId = ids.thread.create();
    expect(() => transcripts.get(missingThreadId)).toThrow(
      `Thread "${missingThreadId}" does not exist.`,
    );
  });

  it("reads the complete model context independently of message-page limits", () => {
    const { threads, transcripts } = openTranscriptEnvironment();
    const thread = threads.create();
    const messageCount = THREAD_MESSAGE_PAGE_MAX_COUNT + 2;
    const contentLength = Math.ceil(THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET / messageCount) + 1;
    const messages = Array.from({ length: messageCount }, (_, index) =>
      threads.startTurn(thread.id, `${index}: ${"x".repeat(contentLength)}`),
    );

    expect(
      threads.listMessages({ threadId: thread.id, direction: "older" }).messages.length,
    ).toBeLessThan(messageCount);

    const transcript = transcripts.get(thread.id);
    expect(transcript.entries).toHaveLength(messageCount);
    expect(transcript.entries[0]).toEqual({
      kind: ThreadTranscriptEntryKind.Message,
      messageId: messages[0]!.message.id,
      author: "user",
      content: messages[0]!.message.content,
    });
    expect(transcript.entries.at(-1)).toEqual({
      kind: ThreadTranscriptEntryKind.Message,
      messageId: messages.at(-1)!.message.id,
      author: "user",
      content: messages.at(-1)!.message.content,
    });
  });
});
