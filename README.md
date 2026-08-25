# Jaquelene

A Bun-managed monorepo for Jaquelene applications.

## Workspace

```text
apps/
└── jaquelene-desktop/  Electron + React desktop application
```

The desktop app keeps Electron's privileged main process, its narrow preload
bridge, and the browser-like React renderer separate. Node integration is
disabled in the renderer and context isolation and sandboxing are enabled.

## Requirements

- Bun 1.4+
- A supported desktop environment for Electron

Vite+ is installed locally and exposed through the `vp` command used by the
workspace scripts.

## Commands

```sh
bun install        # install all workspace dependencies
bun run dev        # start Vite+ and Electron with hot reload
bun run check      # format, lint, and type-check
bun run build      # type-check and create production bundles
bun run package    # create an installer for the current platform
bun run package:dir # create an unpacked app for quick inspection
```
