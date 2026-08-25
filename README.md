# Jaquelene

A Bun-managed monorepo for Jaquelene applications.

## Workspace

```text
apps/
|-- jaquelene-web/      React web application
`-- jaquelene-desktop/  Electron host and desktop packager
```

The web app owns the product UI and runs independently in a browser. The desktop
app loads that web app while keeping Electron's privileged main process separate.
Node integration is disabled in the renderer, and context isolation and
sandboxing are enabled.

## Requirements

- Bun 1.4+
- A supported desktop environment for Electron

Vite+ is installed locally and exposed through the `vp` command used by the
workspace scripts.

## Commands

```sh
bun install         # install all workspace dependencies
bun run dev         # start Vite+ and Electron with hot reload
bun run dev:web     # start only the web app
bun run check       # verify formatting and lint rules
bun run build       # type-check and build web plus desktop bundles
bun run build:web   # build only the web app
bun run package     # create an installer for the current platform
bun run package:dir # create an unpacked app for quick inspection
```
