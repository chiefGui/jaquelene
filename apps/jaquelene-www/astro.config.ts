import react from "@astrojs/react";
import stylex from "@stylexjs/unplugin";
import wgslVitePlugin from "@vgpu/wgsl/loader-vite";
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  integrations: [react()],
  output: "static",
  site: "https://jaquelene.com",
  vite: {
    plugins: [
      wgslVitePlugin({ minify: true }),
      stylex.vite({
        sxPropName: false,
        unstable_moduleResolution: {
          type: "commonJS",
          rootDir: workspaceRoot,
        },
        useCSSLayers: {
          before: ["reset"],
          prefix: "stylex",
        },
      }),
    ],
  },
});
