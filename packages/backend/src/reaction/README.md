# Reactions

Reaction skills generate reactions to the latest scene from campaign context. Friendly and Hostile follow the user's established voice and narrative perspective, using actions or dialogue as appropriate. They do not assume a particular character or grammatical person, and do not read or modify a composer or an unsent draft.

Use `backend.reactions.list()` to discover the registered skills and `backend.reactions.execute({ skillId, threadId, configuration })` to execute one. Execution returns an Effect containing `{ text }`; failures and interruption use Effect's error and interruption channels.

Each authored definition supplies its descriptor, instructions, and bounded history request. `createReactionSkill` turns that definition into a `Skill<ReactionRequest, Reaction>` whose only inputs are the thread and requested model configuration. It owns context preparation, model resolution, accounted execution, reaction validation, and source freshness checks.

To add another reaction skill, author its definition and register it in `subsystem.ts`. Dependencies are wired once and shared across the registered skills. The catalog only lists descriptors and dispatches requests by ID.

History comes from the existing [thread history reader](../thread/README.md). Prompt formatting and requirements for a usable scene belong here. A different skill family can reuse the reader with its own rules.

Source freshness is checked against the selected messages, active head, and campaign scenario when execution completes. Applying a reaction to another resource is the consumer's responsibility: the composer integration uses conditional draft replacement to preserve newer edits. The completion check and draft replacement are separate operations.

The desktop adapter owns request cancellation and translates Effect outcomes into the IPC result envelope. Usage settlement remains owned by accounted model execution, including interruption and provider failures.
