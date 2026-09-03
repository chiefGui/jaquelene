import { defineConfig } from "vite-plus";
import { createStylexTestPlugin } from "./apps/jaquelene-web/stylex.config.ts";

function pluginsForMode(mode: string) {
  if (mode === "test") {
    return [createStylexTestPlugin()];
  }

  return [];
}

export default defineConfig(({ mode }) => ({
  defaultPackage: "./apps/jaquelene-desktop",
  resolve: {
    tsconfigPaths: true,
  },
  plugins: pluginsForMode(mode),
  lint: {
    overrides: [
      {
        files: [
          "apps/jaquelene-desktop/src/application/desktop-application.ts",
          "apps/jaquelene-desktop/src/feature/provider/**",
          "apps/jaquelene-web/src/feature/brand/catalog.tsx",
          "apps/jaquelene-web/src/feature/provider/**",
          "apps/jaquelene-web/src/routes/settings/providers.tsx",
          "packages/backend/src/provider/**",
          "packages/domain/src/provider/**",
        ],
        rules: {
          "no-ternary": "error",
        },
      },
    ],
  },
  fmt: {
    ignorePatterns: [
      "apps/jaquelene-web/src/routeTree.gen.ts",
      "packages/backend/src/migrations/**/snapshot.json",
      "**/generated/**",
      "CHANGELOG.md",
    ],
  },
  staged: {
    "*": "vp fmt --write --no-error-on-unmatched-pattern",
  },
}));
