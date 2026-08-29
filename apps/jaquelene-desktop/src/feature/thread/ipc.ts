import {
  ThreadMessageAuthor as IpcThreadMessageAuthor,
  Threads as ThreadsIpc,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { ThreadMessage } from "./schema";
import type { Threads } from "./threads";

function toIpcAuthor(author: ThreadMessage["author"]) {
  switch (author) {
    case "user":
      return IpcThreadMessageAuthor.User;
    case "assistant":
      return IpcThreadMessageAuthor.Assistant;
  }
}

function toIpcMessage(message: ThreadMessage) {
  return { ...message, author: toIpcAuthor(message.author) };
}

export function exposeThreads(target: WebFrameMain, threads: Threads) {
  ThreadsIpc.for(target).setImplementation({
    listMessages(request) {
      const page = threads.listMessages(request);
      return { ...page, messages: page.messages.map(toIpcMessage) };
    },
    appendUserMessage(threadId, content) {
      return toIpcMessage(threads.appendUserMessage(threadId, content));
    },
  });
}
