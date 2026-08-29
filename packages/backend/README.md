# Backend

`@jaquelene/backend` is Jaquelene's application composition and lifetime boundary.

It owns SQLite, migrations, IDs, scenarios, campaigns, threads, prompt compilation, generation state, active generation supervision, the provider registry, and storage measurement. Platform code supplies provider adapters and filesystem locations, then consumes the plain TypeScript facade returned by `createBackend`.

A provider adapter declares one stable identity and supplies configuration, model discovery, and generation capabilities. The provider subsystem validates and routes those capabilities, gives every network operation a cancellation signal, orders configuration changes, and derives provider-owned storage from the configuration capability. Disconnecting a provider stops and drains its active work before removing its credential. Adding a provider does not add another backend registry or storage manifest entry.

Electron, IPC, windows, secure credential storage, and provider SDK details remain outside this package. Effect is an internal resource-management tool: it acquires backend resources once and releases them in dependency order, while synchronous SQLite operations stay on the direct hot path.

Bundlers consume `@jaquelene/backend/build` to copy required runtime directories without depending on this package's source layout.

Within the package, same-feature imports stay relative and cross-feature imports use the private `#backend/*` package map.

Closing the backend stops new work, interrupts and drains active generations, and closes SQLite last. A closed backend cannot be reused; create a new backend to reopen persisted state.
