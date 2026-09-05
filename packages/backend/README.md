# Backend

`@jaquelene/backend` is Jaquelene's application composition and lifetime boundary.

It owns SQLite, migrations, IDs, campaigns, the skill catalog and campaign composition, threads, durable turn submission and retry, reply preparation, model execution, generation state, active generation supervision, the provider registry, and storage measurement. Platform code supplies provider adapters and filesystem locations to `BackendService.layer`, provides that layer to the application program, and consumes the backend facade within the resulting scope.

A provider factory declares one stable identity and its owned configuration paths; its adapter supplies configuration, model discovery, and generation capabilities. The backend validates those paths in the storage registry before acquiring resources and rejects disagreement between the factory declaration and the adapter's configuration capability. The provider subsystem routes capabilities, gives every network operation a cancellation signal, and orders configuration changes. Disconnecting a provider stops and drains its active work before removing its credential. Adding a provider does not add another backend registry or storage manifest entry.

Model execution is the feature-neutral boundary over those provider capabilities. It resolves requested model configuration against the live catalog, routes semantic model input with execution and optional grouping identities, propagates interruption, classifies failures, and normalizes provider accounting. Feature workflows own their domain state and output validation; reply generation, for example, owns durable generation and message settlement rather than pushing thread concepts into provider adapters.

Usage owns the provider-attempt ledger, accounting persistence, and recovery of interrupted attempts. Each attempt references an execution and may carry a caller-supplied attribution kind and identity; usage does not look up feature entities. Campaign code supplies and queries campaign attribution. Deleting an individual campaign or thread history preserves its incurred usage. Reply settlement composes accounting and content writes in one transaction and publishes the usage change after commit. Clearing usage checks active provider attempts; preparation that has not dispatched a provider request does not block clearing settled history.

Skills are reusable definitions with a key, kind, title, origin, and prompt. The prompt is their instruction text, with its own validation; it is not an independently persisted entity or service. The catalog owns built-in installation, custom skills, pagination, and per-kind defaults. Registering a skill kind requires only its definition, built-ins, and optional fallback—not an execution hook or campaign behavior.

Campaigns own their skill selections and resolve explicit selection, catalog default, then built-in fallback. Narrator is the first consumer: its separately registered campaign application contributes the selected skill's prompt as one system instruction. Adding a catalog skill does not automatically contribute it to narration. To add another campaign contribution, register its application explicitly at the backend composition root; neither the catalog nor the instruction registry needs another branch.

Campaign selections remain inspectable live references, so prompt edits and inherited-default changes affect the next reply without rewriting dialogue history. Deleting a custom skill clears dependent selections and defaults through database constraints. Clearing an explicit campaign selection restores inheritance. Threads remain independent, and standalone threads remain dialogue-only. A thread transcript is a live projection of resolved instructions and active message ancestry; campaigns may contribute context, but they neither own nor persist transcripts. The turn service composes thread writes, semantic model-input preparation, and generation into the durable submit/retry workflow; callers supply only a thread identity and model.

A storage area is the canonical ownership and measurement unit. Usage remains attributable to individual owners, categories are projections over those areas, and both area and category deletion route through owner-defined lifecycle operations. Successful deletion returns fresh usage for only the affected areas, avoiding unrelated filesystem scans.

Electron, IPC, windows, secure credential storage, and provider SDK details remain outside this package. Effect 4 is the backend application and infrastructure runtime for dependency composition, typed operational failures, asynchronous workflows, concurrency, cancellation, and resource lifetimes. Pure transformations and synchronous SQLite transactions stay on the direct TypeScript hot path, and platform adapters execute backend Effects through the shared runtime rather than owning additional runtimes.

Bundlers consume `@jaquelene/backend/build` to copy required runtime directories without depending on this package's source layout.

Within the package, same-feature imports stay relative and cross-feature imports use the private `#backend/*` package map.

The application scope owns the backend lifetime. Closing it stops new work, interrupts and drains active generations, and closes SQLite last; reopening persisted state builds a new application scope.

The SQLite baseline includes the skill catalog and execution-based usage accounting. Existing databases with the previous prompt catalog require a reset. For a development profile, close Jaquelene and run `bun run db:reset`; this removes that profile's content and cache databases while preserving its settings and provider credentials.
