# Backend

`@jaquelene/backend` is Jaquelene's application composition and lifetime boundary.

It owns SQLite, migrations, IDs, campaigns, the prompt catalog and campaign composition, threads, durable turn submission and retry, reply preparation, model execution, generation state, active generation supervision, the provider registry, and storage measurement. Platform code supplies provider adapters and filesystem locations to `BackendService.layer`, provides that layer to the application program, and consumes the backend facade within the resulting scope.

A provider factory declares one stable identity and its owned configuration paths; its adapter supplies configuration, model discovery, and generation capabilities. The backend validates those paths in the storage registry before acquiring resources and rejects disagreement between the factory declaration and the adapter's configuration capability. The provider subsystem routes capabilities, gives every network operation a cancellation signal, and orders configuration changes. Disconnecting a provider stops and drains its active work before removing its credential. Adding a provider does not add another backend registry or storage manifest entry.

Model execution is the feature-neutral boundary over those provider capabilities. It resolves requested model configuration against the live catalog, routes semantic model input with execution and optional grouping identities, propagates interruption, classifies failures, and normalizes provider accounting. Feature workflows own their domain state and output validation; reply generation, for example, owns durable generation and message settlement rather than pushing thread concepts into provider adapters.

Usage owns the provider-attempt ledger, accounting persistence, and recovery of interrupted attempts. Each attempt references an execution and may carry a caller-supplied attribution kind and identity; usage does not look up feature entities. Campaign code supplies and queries campaign attribution. Deleting an individual campaign or thread history preserves its incurred usage. Reply settlement composes accounting and content writes in one transaction and publishes the usage change after commit. Clearing usage checks active provider attempts; preparation that has not dispatched a provider request does not block clearing settled history.

Campaigns are top-level, titled compositions over reusable prompts. A prompt has an application-defined kind; the narrator kind is the first implementation and contributes one system instruction at reply preparation. Campaign selections remain inspectable live references, so prompt edits and inherited-default changes affect the next reply without rewriting dialogue history. Deleting a custom prompt clears dependent selections and defaults through database constraints, exposing the built-in fallback again. Threads remain independent, and standalone threads remain dialogue-only. A thread transcript is a live projection of resolved instructions and active message ancestry; campaigns may contribute context, but they neither own nor persist transcripts.

Prompt applications are the extension boundary between the generic catalog and model input. The catalog never decides how prompt content is applied, and the instruction registry never owns prompt persistence or selection. The turn service composes thread writes, semantic model-input preparation, and generation into the durable submit/retry workflow; callers supply only a thread identity and model.

A storage area is the canonical ownership and measurement unit. Usage remains attributable to individual owners, categories are projections over those areas, and both area and category deletion route through owner-defined lifecycle operations. Successful deletion returns fresh usage for only the affected areas, avoiding unrelated filesystem scans.

Electron, IPC, windows, secure credential storage, and provider SDK details remain outside this package. Effect 4 is the backend application and infrastructure runtime for dependency composition, typed operational failures, asynchronous workflows, concurrency, cancellation, and resource lifetimes. Pure transformations and synchronous SQLite transactions stay on the direct TypeScript hot path, and platform adapters execute backend Effects through the shared runtime rather than owning additional runtimes.

Bundlers consume `@jaquelene/backend/build` to copy required runtime directories without depending on this package's source layout.

Within the package, same-feature imports stay relative and cross-feature imports use the private `#backend/*` package map.

The application scope owns the backend lifetime. Closing it stops new work, interrupts and drains active generations, and closes SQLite last; reopening persisted state builds a new application scope.

The SQLite baseline includes execution-based usage accounting. Existing databases from before this baseline require a reset. For a development profile, close Jaquelene and run `bun run db:reset`; this removes that profile's content and cache databases while preserving its settings and provider credentials.

## Provider performance baseline

Run `bun run --cwd packages/backend bench:providers` from the repository root. Bun bundles the harness; Node executes it against the real provider and model-execution services. It uses synthetic provider responses and SQLite in memory, with no network, credentials, or user-profile files. Generated JavaScript stays in the ignored package cache.

Each process runs 10 warmup rounds and 15 measured rounds, rotating workload order. Each sample is a batch mean; output includes all samples, their median/range, iteration counts, and the host details. Timed cycles include assertions and orchestration. The two acquisition workloads include cache initialization and shutdown; the configuration workload includes invalidation and a fresh 256-model catalog load. These are warmed service measurements, not cold application startup or individual-request tail latency.

Initial baseline against production code at `41f226d`, before the provider refactor: Windows x64, Node 24.7.0, Effect 4.0.0-rc.112 with the repository patch, Bun 1.4.1, Intel Core i9-9900KF. Each column is an independent process run; values are microseconds per named operation or complete cycle.

| Workload                                                  |  Run 1 |  Run 2 |  Run 3 |
| --------------------------------------------------------- | -----: | -----: | -----: |
| acquire and release two providers with an in-memory cache | 360.34 | 356.53 | 366.76 |
| hot model lookup in a 256-model catalog                   |   1.70 |   1.61 |   1.71 |
| dispatch one immediate generation                         |   1.88 |   1.84 |   1.85 |
| execute through the model Effect service                  |  26.85 |  25.83 |  26.08 |
| dispatch 32 concurrent generations                        |  61.26 |  54.69 |  56.26 |
| replace configuration and reload the catalog              | 540.06 | 566.28 | 567.85 |
| dispatch and cancel 32 generations                        | 284.63 | 244.91 | 290.07 |
| acquire, dispatch 32 generations, and shut down           | 733.68 | 715.10 | 711.97 |

Use the same runtime, fixtures, batch sizes, and machine for before/after comparisons. Repeat fresh-process runs and report absolute differences alongside percentages; the spread above shows why a single run is not a regression gate. Investigate repeatable slowdowns outside observed noise before accepting a refactor. Do not speed up a benchmark by omitting disposal, interruption, validation, or cache invalidation. Operation-count and result assertions enforce those paths where observable; behavioral tests remain the correctness gate.

This baseline does not establish cross-platform parity, allocation bounds, or worst-case latency. Changes to concurrency or operation bookkeeping also require targeted allocation/CPU profiling and lifecycle stress checks before the refactor is considered complete.
