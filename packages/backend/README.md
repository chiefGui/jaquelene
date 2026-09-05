# Backend

`@jaquelene/backend` is Jaquelene's application composition and lifetime boundary.

It owns SQLite, migrations, IDs, campaigns, the prompt catalog and campaign composition, threads, durable turn submission and retry, reply preparation, model execution, generation state, active generation supervision, the provider registry, and storage measurement. Platform code supplies provider adapters and filesystem locations to `BackendService.layer`, provides that layer to the application program, and consumes the backend facade within the resulting scope.

A provider factory declares one stable identity and its owned configuration paths; its adapter supplies configuration, model discovery, and generation capabilities. The backend validates those paths in the storage registry before acquiring resources and rejects disagreement between the factory declaration and the adapter's configuration capability. The provider subsystem routes capabilities, gives every network operation a cancellation signal, and orders configuration changes. Disconnecting a provider stops and drains its active work before removing its credential. Adding a provider does not add another backend registry or storage manifest entry.

`Inference` is the feature-neutral boundary over those provider capabilities. It resolves requested model configuration against the live catalog, routes semantic model input with execution and optional grouping identities, propagates interruption, classifies failures, and normalizes provider accounting. Input source keys are caller-owned strings, not application message IDs. Feature workflows own their domain state and output validation; reply generation, for example, owns durable generation and message settlement rather than pushing thread concepts into provider adapters.

## Editor AI actions

`AiActionDefinition` describes one text-producing editor operation: its identity, label, whether it requires existing text, input preparation, and result validation. `AiActionRunner` executes these definitions through `Inference` and records provider attempts through Usage. Narrator owns its optimization and fresh-writing guidance in `src/narrator/ai-actions.ts`; the runner does not import narrator or branch on action names.

To add a consumer, export an `AiActionSet` from that feature, register it in backend composition, and supply its target key to the editor integration. Sets may reuse definitions or provide exclusive actions. Adding a definition does not require changing an action enum, the runner, or provider adapters. The contract currently covers bounded text input and output, not tools, autonomous agents, or arbitrary structured operations.

The desktop adapter supplies an independently stored AI action model, with no campaign fallback. Its renderer-scoped session bounds concurrent operations and cancels work on explicit cancellation, document navigation, renderer loss, and window closure. Model resolution and inference each have a two-minute deadline. Provider attempts settle on success, failure, and interruption; successful provider usage remains recorded even when result validation rejects the text.

Editor results replace only the unsaved field value. The affected field is read-only while running, and saving waits until the action settles. The most recent AI replacement can be undone and redone while the field still matches either snapshot; manual edits are never overwritten by that control. No action-result table, conversation, or prompt save is created. No database reset is required for editor AI actions.

## Application ownership

Usage owns the provider-attempt ledger, accounting persistence, and recovery of interrupted attempts. Each attempt references an execution and may carry a caller-supplied attribution kind and identity; usage does not look up feature entities. Campaign code supplies and queries campaign attribution. Deleting an individual campaign or thread history preserves its incurred usage. Reply settlement composes accounting and content writes in one transaction and publishes the usage change after commit. Clearing usage checks active provider attempts; preparation that has not dispatched a provider request does not block clearing settled history.

Campaigns are top-level, titled compositions over reusable prompts. A prompt has an application-defined kind; the narrator kind is the first implementation and contributes one system instruction at reply preparation. Campaign selections remain inspectable live references, so prompt edits and inherited-default changes affect the next reply without rewriting dialogue history. Deleting a custom prompt clears dependent selections and defaults through database constraints, exposing the built-in fallback again. Threads remain independent, and standalone threads remain dialogue-only. A thread transcript is a live projection of resolved instructions and active message ancestry; campaigns may contribute context, but they neither own nor persist transcripts.

Prompt applications are the extension boundary between the generic catalog and model input. The catalog never decides how prompt content is applied, and the instruction registry never owns prompt persistence or selection. The turn service composes thread writes, semantic model-input preparation, and generation into the durable submit/retry workflow; callers supply only a thread identity and model.

A storage area is the canonical ownership and measurement unit. Usage remains attributable to individual owners, categories are projections over those areas, and both area and category deletion route through owner-defined lifecycle operations. Successful deletion returns fresh usage for only the affected areas, avoiding unrelated filesystem scans.

Electron, IPC, windows, secure credential storage, and provider SDK details remain outside this package. Effect 4 is the backend application and infrastructure runtime for dependency composition, typed operational failures, asynchronous workflows, concurrency, cancellation, and resource lifetimes. Pure transformations and synchronous SQLite transactions stay on the direct TypeScript hot path, and platform adapters execute backend Effects through the shared runtime rather than owning additional runtimes.

Bundlers consume `@jaquelene/backend/build` to copy required runtime directories without depending on this package's source layout.

Within the package, same-feature imports stay relative and cross-feature imports use the private `#backend/*` package map.

The application scope owns the backend lifetime. Closing it stops new work, interrupts and drains active generations, and closes SQLite last; reopening persisted state builds a new application scope.

The SQLite baseline includes execution-based usage accounting. Existing databases from before this baseline require a reset. For a development profile, close Jaquelene and run `bun run db:reset`; this removes that profile's content and cache databases while preserving its settings and provider credentials.
