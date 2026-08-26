import { cpSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import type { Plugin } from "vite";
import { defineConfig } from "vite-plus";
import electron from "vite-plugin-electron/simple";
import webConfig from "../jaquelene-web/vite.config";

const desktopRoot = fileURLToPath(new URL(".", import.meta.url));
const electronOutput = fileURLToPath(new URL("./dist-electron", import.meta.url));
const mainEntry = fileURLToPath(new URL("./src/main.ts", import.meta.url));
const migrationsDirectory = fileURLToPath(new URL("./src/migrations", import.meta.url));
const preloadEntry = fileURLToPath(new URL("./src/preload.ts", import.meta.url));

const migrationsPlugin = {
  name: "jaquelene-database-migrations",
  apply: "build",
  writeBundle: () => {
    cpSync(migrationsDirectory, join(electronOutput, "migrations"), { recursive: true });
  },
} satisfies Plugin;

export default defineConfig(
  mergeConfig(webConfig, {
    plugins: [
      electron({
        main: {
          entry: mainEntry,
          vite: {
            root: desktopRoot,
            plugins: [migrationsPlugin],
            build: {
              outDir: electronOutput,
              emptyOutDir: true,
              rolldownOptions: {
                external: ["electron-store"],
              },
            },
          },
          onstart: async ({ startup }) => {
            await startup(["."], { cwd: desktopRoot });
          },
        },
        preload: {
          input: preloadEntry,
          vite: {
            root: desktopRoot,
            build: {
              outDir: electronOutput,
              emptyOutDir: false,
              rolldownOptions: {
                output: {
                  entryFileNames: "preload.cjs",
                },
              },
            },
          },
        },
      }),
    ],
  }),
);
