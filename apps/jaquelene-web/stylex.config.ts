import stylex from "@stylexjs/unplugin";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

// StyleX 0.19 supports this option at runtime but omits it from UserOptions.
type StyleXOptions = NonNullable<Parameters<typeof stylex.vite>[0]> & {
  externalPackages: string[];
};

const stylexOptions = {
  externalPackages: ["@jaquelene/ui"],
  sxPropName: false,
  unstable_moduleResolution: {
    type: "commonJS",
    rootDir: workspaceRoot,
  },
  useCSSLayers: {
    before: ["reset"],
    prefix: "stylex",
  },
} satisfies StyleXOptions;

export function createStylexPlugin(): Plugin {
  return stylex.vite(stylexOptions);
}

export function createStylexTestPlugin(): Plugin {
  const plugin: Plugin = stylex.vite({ ...stylexOptions, test: true });
  // Vitest needs compilation, but the dev-server HMR interval would outlive the test process.
  delete plugin.configureServer;
  return plugin;
}
