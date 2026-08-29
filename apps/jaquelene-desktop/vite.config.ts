import { cpSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getBackendBuildDirectories } from "@jaquelene/backend/build";
import { mergeConfig } from "vite";
import type { Plugin } from "vite";
import { defineConfig } from "vite-plus";
import electron from "vite-plugin-electron/simple";
import webConfig from "../jaquelene-web/vite.config";
import {
  createDevelopmentProfileId,
  developmentProfileEnvironmentVariable,
  requireDevelopmentProfileId,
} from "./src/development-profile";

const desktopRoot = fileURLToPath(new URL(".", import.meta.url));
const worktreeRoot = realpathSync.native(fileURLToPath(new URL("../..", import.meta.url)));
const electronOutput = fileURLToPath(new URL("./dist-electron", import.meta.url));
const mainOutput = join(electronOutput, "main");
const mainEntry = fileURLToPath(new URL("./src/main.ts", import.meta.url));
const preloadOutput = join(electronOutput, "preload");
const preloadEntry = fileURLToPath(new URL("./src/preload.ts", import.meta.url));
const backendBuildDirectories = getBackendBuildDirectories(mainOutput);

const backendBuildPlugin = {
  name: "jaquelene-backend-build-directories",
  apply: "build",
  writeBundle: () => {
    for (const { sourceDirectory, destinationDirectory } of backendBuildDirectories) {
      rmSync(destinationDirectory, { recursive: true, force: true });
      cpSync(sourceDirectory, destinationDirectory, { recursive: true });
    }
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
              tsconfigPaths: true,
            },
            plugins: [backendBuildPlugin],
            build: {
              outDir: mainOutput,
              emptyOutDir: true,
              rolldownOptions: {
                external: ["electron-store"],
              },
            },
          },
          onstart: async ({ startup }) => {
            const developmentProfileId = requireDevelopmentProfileId(
              process.env[developmentProfileEnvironmentVariable] ??
                createDevelopmentProfileId(worktreeRoot),
            );

            await startup(["."], {
              cwd: desktopRoot,
              env: {
                ...process.env,
                [developmentProfileEnvironmentVariable]: developmentProfileId,
              },
            });
          },
        },
        preload: {
          input: preloadEntry,
          vite: {
            root: desktopRoot,
            resolve: {
              conditions: ipcConditions,
              tsconfigPaths: true,
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
