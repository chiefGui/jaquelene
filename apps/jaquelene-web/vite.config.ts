import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vite-plus";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

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
  plugins: [
    contentSecurityPolicyPlugin,
    tanstackRouter({
      target: "react",
      quoteStyle: "double",
      semicolons: true,
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
