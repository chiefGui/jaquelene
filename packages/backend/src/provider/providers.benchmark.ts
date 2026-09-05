import assert from "node:assert/strict";
import { cpus } from "node:os";
import { Layer, ManagedRuntime } from "effect";
import { ids } from "#backend/id";
import { ModelExecutionService } from "#backend/model/execution";
import { ResourceCacheService } from "#backend/resource-cache/service";
import type {
  ApiKeyProviderConfigurationSnapshot,
  ProviderFactory,
  ProviderGenerationAdapter,
  ProviderGenerationResult,
} from "./provider";
import { ProvidersService } from "./providers";

const reply = { text: "Reply" };
const models = Array.from({ length: 256 }, (_, index) => ({
  id: `model-${index}`,
  name: `Model ${index}`,
  brandId: "benchmark",
}));
const reference = { providerId: "immediate", modelId: "model-255" };
const request = {
  executionId: "benchmark-execution",
  modelId: reference.modelId,
  input: {
    instructions: [],
    dialogue: [{ messageId: ids.message.create(), role: "user" as const, content: "Hello" }],
  },
};
const modelRequest = {
  executionId: request.executionId,
  input: request.input,
  configuration: { model: reference },
};
const cancellation = new Error("Benchmark cancellation.");
const observed = { acquisitions: 0, releases: 0, modelLoads: 0, generations: 0 };

function providerFactory(
  id: string,
  generate: ProviderGenerationAdapter["generate"],
): ProviderFactory {
  return {
    id,
    storagePaths: [],
    create() {
      observed.acquisitions += 1;
      let revision = 1;
      let configuration: ApiKeyProviderConfigurationSnapshot = {
        state: "configured",
        keyLabel: "benchmark",
        revision: String(revision),
      };
      return {
        descriptor: { id, name: id, brandId: "benchmark" },
        configuration: {
          kind: "api-key",
          inspect: () => configuration,
          async configure() {
            revision += 1;
            configuration = {
              state: "configured",
              keyLabel: "benchmark",
              revision: String(revision),
            };
            return { state: "configured", keyLabel: "benchmark" };
          },
          async clear() {
            configuration = { state: "unconfigured" };
          },
        },
        models: {
          async list() {
            observed.modelLoads += 1;
            return models;
          },
        },
        generation: { generate },
        async [Symbol.asyncDispose]() {
          observed.releases += 1;
        },
      };
    },
  };
}

async function benchmarkProviders() {
  let pendingStarted = () => {};
  let pendingSignals: AbortSignal[] = [];
  const cacheFailures: unknown[] = [];
  const reportFailure = (failure: unknown) => {
    cacheFailures.push(failure);
  };
  const factories = [
    providerFactory("immediate", async () => {
      observed.generations += 1;
      return reply;
    }),
    providerFactory("pending", (_request, signal) => {
      signal.throwIfAborted();
      const result = new Promise<ProviderGenerationResult>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
      pendingSignals.push(signal);
      if (pendingSignals.length === 32) {
        pendingStarted();
      }
      return result;
    }),
  ];

  function providerLayer() {
    return ProvidersService.layer(factories).pipe(
      Layer.provide(ResourceCacheService.layer({ path: ":memory:", reportFailure })),
    );
  }

  const runtime = ManagedRuntime.make(
    ModelExecutionService.layer.pipe(Layer.provideMerge(providerLayer())),
  );

  async function startPending(activeProviders: ProvidersService["Service"]) {
    const started = Promise.withResolvers<void>();
    pendingStarted = started.resolve;
    pendingSignals = [];
    const controller = new AbortController();
    const route = activeProviders.generations.get("pending")!;
    const results = Promise.allSettled(
      Array.from({ length: 32 }, () => route.generate(request, controller.signal)),
    );
    await started.promise;
    return { controller, results };
  }

  function verifyInterrupted(results: PromiseSettledResult<ProviderGenerationResult>[]) {
    assert.equal(results.length, 32);
    assert.ok(results.every((result) => result.status === "rejected"));
    assert.ok(pendingSignals.every((signal) => signal.aborted));
  }

  try {
    const providers = await runtime.runPromise(ProvidersService);
    const executor = await runtime.runPromise(ModelExecutionService);
    await providers.models.getModel(reference);

    const workloads = [
      {
        name: "acquire and release two providers with an in-memory cache",
        iterations: 100,
        async run() {
          const { acquisitions, releases } = observed;
          const lifecycle = ManagedRuntime.make(providerLayer());
          try {
            const active = await lifecycle.runPromise(ProvidersService);
            assert.equal(active.providers.list().length, 2);
          } finally {
            await lifecycle.dispose();
          }
          assert.equal(observed.acquisitions - acquisitions, 2);
          assert.equal(observed.releases - releases, 2);
        },
      },
      {
        name: "hot model lookup in a 256-model catalog",
        iterations: 2_000,
        async run() {
          const loads = observed.modelLoads;
          assert.equal((await providers.models.getModel(reference)).id, reference.modelId);
          assert.equal(observed.modelLoads, loads);
        },
      },
      {
        name: "dispatch one immediate generation",
        iterations: 1_000,
        async run() {
          const calls = observed.generations;
          assert.equal(
            (await providers.generations.get("immediate")!.generate(request)).text,
            reply.text,
          );
          assert.equal(observed.generations - calls, 1);
        },
      },
      {
        name: "execute through the model Effect service",
        iterations: 1_000,
        async run() {
          const calls = observed.generations;
          const result = await runtime.runPromise(executor.execute(modelRequest));
          assert.equal(result.outcome, "completed");
          if (result.outcome === "completed") {
            assert.equal(result.text, reply.text);
          }
          assert.equal(observed.generations - calls, 1);
        },
      },
      {
        name: "dispatch 32 concurrent generations",
        iterations: 100,
        async run() {
          const calls = observed.generations;
          const route = providers.generations.get("immediate")!;
          const results = await Promise.all(
            Array.from({ length: 32 }, () => route.generate(request)),
          );
          assert.equal(results.length, 32);
          assert.ok(results.every((result) => result.text === reply.text));
          assert.equal(observed.generations - calls, 32);
        },
      },
      {
        name: "replace configuration and reload the catalog",
        iterations: 50,
        async run() {
          const loads = observed.modelLoads;
          await providers.providers.configureApiKey("immediate", "benchmark-key");
          assert.equal((await providers.models.getModel(reference)).id, reference.modelId);
          assert.equal(observed.modelLoads - loads, 1);
        },
      },
      {
        name: "dispatch and cancel 32 generations",
        iterations: 100,
        async run() {
          const pending = await startPending(providers);
          pending.controller.abort(cancellation);
          verifyInterrupted(await pending.results);
        },
      },
      {
        name: "acquire, dispatch 32 generations, and shut down",
        iterations: 100,
        async run() {
          const lifecycle = ManagedRuntime.make(providerLayer());
          try {
            const pending = await startPending(await lifecycle.runPromise(ProvidersService));
            await lifecycle.dispose();
            verifyInterrupted(await pending.results);
          } finally {
            await lifecycle.dispose();
          }
        },
      },
    ];

    const warmups = 10;
    const samples = 15;
    const measurements = workloads.map(() => [] as number[]);
    for (let round = 0; round < warmups + samples; round += 1) {
      for (let offset = 0; offset < workloads.length; offset += 1) {
        const index = (round + offset) % workloads.length;
        const workload = workloads[index]!;
        const start = performance.now();
        for (let iteration = 0; iteration < workload.iterations; iteration += 1) {
          await workload.run();
        }
        const milliseconds = (performance.now() - start) / workload.iterations;
        if (round >= warmups) {
          measurements[index]!.push(milliseconds);
        }
      }
    }
    return {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model,
      warmups,
      samples,
      results: workloads.map(({ name, iterations }, index) => {
        const sampleMilliseconds = measurements[index]!;
        const ordered = sampleMilliseconds.toSorted((first, second) => first - second);
        return {
          name,
          iterations,
          medianMilliseconds: ordered[Math.floor(samples / 2)],
          minMilliseconds: ordered[0],
          maxMilliseconds: ordered.at(-1),
          sampleMilliseconds,
        };
      }),
    };
  } finally {
    await runtime.dispose();
    assert.equal(observed.acquisitions, observed.releases);
    assert.deepEqual(cacheFailures, []);
  }
}

console.log(JSON.stringify(await benchmarkProviders(), null, 2));
