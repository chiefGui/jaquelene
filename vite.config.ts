import { defineConfig } from "vite-plus";

export default defineConfig({
  defaultPackage: "./apps/jaquelene-desktop",
  resolve: {
    tsconfigPaths: true,
  },
  fmt: {
    ignorePatterns: ["apps/jaquelene-web/src/routeTree.gen.ts", "**/generated/**"],
  },
});
