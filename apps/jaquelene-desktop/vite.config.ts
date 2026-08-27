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
const mainOutput = join(electronOutput, "main");
const mainEntry = fileURLToPath(new URL("./src/main.ts", import.meta.url));
const migrationsDirectory = fileURLToPath(new URL("./src/migrations", import.meta.url));
const preloadOutput = join(electronOutput, "preload");
const preloadEntry = fileURLToPath(new URL("./src/preload.ts", import.meta.url));

const migrationsPlugin = {
  name: "jaquelene-database-migrations",
  apply: "build",
  writeBundle: () => {
    cpSync(migrationsDirectory, join(mainOutput, "migrations"), { recursive: true });
  },
} satisfies Plugin;

export default defineConfig(({ command }) => {
  const ipcConditions = command === "serve" ? ["node", "development"] : ["node"];

  return mergeConfig(webConfig, {
    plugins: [
      electron({
        main: {
          entry: mainEntry,
          vite: {
            root: desktopRoot,
            resolve: {
              conditions: ipcConditions,
            },
            plugins: [migrationsPlugin],
            build: {
              outDir: mainOutput,
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
            resolve: {
              conditions: ipcConditions,
            },
            build: {
              outDir: preloadOutput,
              emptyOutDir: true,
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
  });
});
