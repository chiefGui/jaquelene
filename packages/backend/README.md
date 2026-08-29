# Backend

`@jaquelene/backend` is Jaquelene's application composition and lifetime boundary.

It owns SQLite, migrations, IDs, scenarios, campaigns, threads, prompt compilation, generation state, active generation supervision, and storage measurement. Platform code supplies provider adapters and filesystem locations, then consumes the plain TypeScript facade returned by `createBackend`.

Electron, IPC, windows, secure credential storage, and provider SDK details remain outside this package. Effect is an internal resource-management tool: it acquires backend resources once and releases them in dependency order, while synchronous SQLite operations stay on the direct hot path.

Closing the backend stops new work, interrupts and drains active generations, and closes SQLite last. A closed backend cannot be reused; create a new backend to reopen persisted state.
