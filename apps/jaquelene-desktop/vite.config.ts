import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import electron from "vite-plugin-electron/simple";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: appRoot,
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: "electron/main.ts",
        onstart: async ({ startup }) => {
          await startup(["."]);
        },
      },
    }),
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
