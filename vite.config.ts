import { defineConfig } from "vite-plus";
import { createStylexTestPlugin } from "./apps/jaquelene-web/stylex.config.ts";

export default defineConfig(({ mode }) => ({
  defaultPackage: "./apps/jaquelene-desktop",
  resolve: {
    tsconfigPaths: true,
  },
  plugins: mode === "test" ? [createStylexTestPlugin()] : [],
  fmt: {
    ignorePatterns: ["apps/jaquelene-web/src/routeTree.gen.ts", "**/generated/**"],
  },
}));
