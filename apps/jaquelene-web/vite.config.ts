import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { realpathSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vite-plus";
import { wgslVitePlugin } from "vgpu/client";
import { createStylexPlugin } from "./stylex.config.ts";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

const ipcTestConditionPlugin = {
  name: "jaquelene-ipc-test-condition",
  config: (_config, { mode }) =>
    mode === "test"
      ? {
          resolve: { conditions: ["module", "browser", "jaquelene-test", "development"] },
          ssr: {
            resolve: { conditions: ["module", "node", "jaquelene-test", "development"] },
          },
        }
      : undefined,
} satisfies Plugin;

const contentSecurityPolicyPlugin = {
  name: "jaquelene-content-security-policy",
  transformIndexHtml: {
    order: "pre",
    handler: (_html, { server }) => [
      {
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            `connect-src 'self'${server ? " ws://localhost:*" : ""}`,
            "object-src 'none'",
            "base-uri 'none'",
          ].join("; "),
        },
        injectTo: "head-prepend",
      },
    ],
  },
} satisfies Plugin;

export default defineConfig({
  root: appRoot,
  resolve: {
    // Cached paths and Bun's Windows links can differ in casing. React must keep one identity.
    alias: {
      react: realpathSync.native(dirname(fileURLToPath(import.meta.resolve("react")))),
      "react-dom": realpathSync.native(dirname(fileURLToPath(import.meta.resolve("react-dom")))),
    },
    tsconfigPaths: true,
  },
  plugins: [
    createStylexPlugin(),
    wgslVitePlugin({ minify: true }),
    ipcTestConditionPlugin,
    contentSecurityPolicyPlugin,
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      quoteStyle: "double",
      semicolons: true,
    }),
    react(),
  ],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
