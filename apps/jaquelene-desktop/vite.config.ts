import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import { defineConfig } from "vite-plus";
import electron from "vite-plugin-electron/simple";
import webConfig from "../jaquelene-web/vite.config";

const desktopRoot = fileURLToPath(new URL(".", import.meta.url));
const electronOutput = fileURLToPath(new URL("./dist-electron", import.meta.url));
const mainEntry = fileURLToPath(new URL("./electron/main.ts", import.meta.url));

export default defineConfig(
  mergeConfig(webConfig, {
    plugins: [
      electron({
        main: {
          entry: mainEntry,
          vite: {
            root: desktopRoot,
            build: {
              outDir: electronOutput,
              emptyOutDir: true,
            },
          },
          onstart: async ({ startup }) => {
            await startup(["."], { cwd: desktopRoot });
          },
        },
      }),
    ],
  }),
);
