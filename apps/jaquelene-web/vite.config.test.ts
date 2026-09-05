import { realpathSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type InlineConfig } from "vite-plus";
import { expect, it } from "vite-plus/test";
import webConfig from "./vite.config";

it("shares one React runtime after restarting and discovering another dependency", async () => {
  const appRoot = realpathSync.native(fileURLToPath(new URL(".", import.meta.url)));
  const cacheDir = await mkdtemp(join(appRoot, "node_modules", ".react-optimization-"));
  let reusedCache = false;

  function createConfig(): InlineConfig {
    return {
      root: appRoot,
      resolve: { ...webConfig.resolve },
      configFile: false,
      cacheDir,
      logLevel: "silent",
      optimizeDeps: {
        entries: [],
        include: ["react", "react-dom/client", "react/jsx-runtime"],
      },
      server: { middlewareMode: true, hmr: false },
    };
  }

  try {
    for (const dependency of ["react", "@tanstack/react-query"]) {
      const server = await createServer(createConfig());
      try {
        const optimizer = server.environments.client?.depsOptimizer;
        if (!optimizer) {
          throw new Error("The renderer dependency optimizer is unavailable.");
        }
        await optimizer.init();
        if (optimizer.metadata.optimized.react) {
          reusedCache = true;
        }
        const info = optimizer.registerMissingImport(
          dependency,
          realpathSync.native(fileURLToPath(import.meta.resolve(dependency))).replaceAll("\\", "/"),
        );
        optimizer.run();
        await info.processing;
        expect(optimizer.metadata.optimized[dependency]).toBeDefined();
      } finally {
        await server.close();
      }
    }

    const dependencyDirectory = join(cacheDir, "deps");
    const runtimeFiles: string[] = [];
    for (const file of await readdir(dependencyDirectory)) {
      if (!file.endsWith(".js.map")) {
        continue;
      }

      const map = JSON.parse(await readFile(join(dependencyDirectory, file), "utf8")) as {
        sources: string[];
      };
      if (map.sources.some((source) => source.endsWith("/react/cjs/react.development.js"))) {
        runtimeFiles.push(file);
      }
    }

    expect(reusedCache).toBe(true);
    expect(runtimeFiles).toHaveLength(1);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});
