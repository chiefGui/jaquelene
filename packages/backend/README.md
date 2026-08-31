# Backend

`@jaquelene/backend` is Jaquelene's application composition and lifetime boundary.

It owns SQLite, migrations, IDs, scenarios, campaigns, the code-owned system-instruction catalog, threads, durable turn submission and retry, reply preparation, generation state, active generation supervision, the provider registry, and storage measurement. Platform code supplies provider adapters and filesystem locations, then consumes the plain TypeScript facade returned by `createBackend`.

A provider adapter declares one stable identity and supplies configuration, model discovery, and generation capabilities. The provider subsystem validates and routes those capabilities, gives every network operation a cancellation signal, orders configuration changes, and derives provider-owned storage from the configuration capability. Disconnecting a provider stops and drains its active work before removing its credential. Adding a provider does not add another backend registry or storage manifest entry.

Threads remain independent of campaigns. Reply preparation resolves campaign-owned context explicitly; a campaign reply includes Jaquelene's factory default roleplay instruction, while a standalone thread remains dialogue-only. The turn service composes a thread write, semantic model-input preparation, and generation into the durable submit/retry workflow; callers supply only a thread identity and model.

A storage area is the canonical ownership and measurement unit. Usage remains attributable to individual owners, categories are projections over those areas, and both area and category deletion route through owner-defined lifecycle operations. Successful deletion returns fresh usage for only the affected areas, avoiding unrelated filesystem scans.

Electron, IPC, windows, secure credential storage, and provider SDK details remain outside this package. Effect is an internal resource-management tool: it acquires backend resources once and releases them in dependency order, while synchronous SQLite operations stay on the direct hot path.

Bundlers consume `@jaquelene/backend/build` to copy required runtime directories without depending on this package's source layout.

Within the package, same-feature imports stay relative and cross-feature imports use the private `#backend/*` package map.

Closing the backend stops new work, interrupts and drains active generations, and closes SQLite last. A closed backend cannot be reused; create a new backend to reopen persisted state.
