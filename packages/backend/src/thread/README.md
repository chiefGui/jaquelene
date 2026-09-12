# Recent history

Use `backend.threads.history.readRecent` for bounded context reads. The reader follows the active message's parents, so unselected response variants and their descendants are excluded. It returns domain messages in chronological order; prompt formatting belongs to the consumer.

```ts
const history = backend.threads.history.readRecent(threadId, {
  selection: { kind: "completed-turns", limit: 5, openingScene: "include" },
  contentByteBudget: 32 * 1024,
});

const messages = backend.threads.history.readRecent(threadId, {
  selection: { kind: "messages", limit: 5 },
  contentByteBudget: 32 * 1024,
});
```

`messages` counts individual entries and includes unanswered messages. `completed-turns` counts connected user/assistant pairs with the same turn identity, skipping unanswered entries. It never returns a partial pair. An opening scene is included only when explicitly requested and reached within the window; it does not count as a completed turn.

Both count and UTF-8 byte limits apply in the database query. The byte budget covers traversed message content, including entries later excluded from the result. Messages are never cut, and an oversized latest message produces an empty selection with `byte-limit`. Scenario text and prompt instructions are outside this history budget.

Completed-turn queries also have a scan limit of 1,024 messages. Set `maximumScannedMessages` on that selection when another bounded scan allowance is needed. This prevents long sequences of unanswered messages from causing unrestricted traversal. All supplied limits must be positive safe integers.

Results include the active `head` identity, selected `messages`, `scannedMessageCount`, `scannedContentBytes`, and a `boundary`:

- `start`: the beginning of history was reached, including an empty thread.
- `selection-limit`: the requested number of messages or completed turns was selected.
- `byte-limit`: the next message would exceed the byte budget.
- `scan-limit`: the scan allowance was exhausted before selecting enough completed turns.

When limits coincide, reaching the beginning takes precedence, then satisfying the selection, then the scan limit. A missing thread throws instead of appearing empty. The head remains available even when its text cannot fit or its turn is incomplete; consumers decide whether that context is usable.

Player-response skills declare a `history` request in their backend definition. Their shared workflow resolves it and guards against changes to the selected messages, active head, or scenario before returning a response. Other capabilities can use the reader directly and apply their own requirements for usable context. History options are not renderer metadata.
