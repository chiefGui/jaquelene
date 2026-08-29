import { Cause, Context, Effect, Exit, Layer, ManagedRuntime } from "effect";
import { createCampaigns, type Campaigns } from "#backend/campaign/campaigns";
import { DatabaseService } from "#backend/database/database";
import { createGenerations, type Generations } from "#backend/generation/generations";
import { createTurnPromptCompiler } from "#backend/generation/prompt";
import type { GenerationProvider } from "#backend/generation/provider";
import { superviseGenerations } from "#backend/generation/supervisor";
import { createScenarios, type Scenarios } from "#backend/scenario/scenarios";
import { StorageService, type Storage, type StorageManifest } from "#backend/storage/storage";
import { createThreads, type Threads } from "#backend/thread/threads";

export type BackendOptions = Readonly<{
  databasePath: string;
  generationProviders: readonly GenerationProvider[];
  storageManifest: StorageManifest;
}>;

export type Backend = Readonly<{
  scenarios: Scenarios;
  campaigns: Campaigns;
  threads: Threads;
  generations: Generations;
  storage: Storage;
  close: () => Promise<void>;
}>;

type Application = Readonly<{
  scenarios: Scenarios;
  campaigns: Campaigns;
  threads: Threads;
  generations: Generations;
  close: () => Promise<void>;
}>;

class ApplicationService extends Context.Service<ApplicationService, Application>()(
  "@jaquelene/backend/Application",
) {}

function createApplicationLayer(providers: readonly GenerationProvider[]) {
  return Layer.effect(
    ApplicationService,
    Effect.gen(function* () {
      const database = yield* DatabaseService;

      return yield* Effect.acquireRelease(
        Effect.sync(() => {
          const scenarios = createScenarios(database);
          const campaigns = createCampaigns(database);
          const threads = createThreads(database);
          const generationEngine = createGenerations(
            database,
            createTurnPromptCompiler(threads),
            providers,
          );
          generationEngine.recoverInterrupted();
          const supervisedGenerations = superviseGenerations(generationEngine);

          return ApplicationService.of({
            scenarios,
            campaigns,
            threads,
            generations: supervisedGenerations.generations,
            close: supervisedGenerations.close,
          });
        }),
        (application) => Effect.promise(() => application.close()),
      );
    }),
  );
}

function asError(cause: unknown, message: string) {
  return cause instanceof Error ? cause : new Error(message, { cause });
}

async function unwrapExit<A, E>(exitPromise: Promise<Exit.Exit<A, E>>) {
  const exit = await exitPromise;

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  throw asError(Cause.squash(exit.cause), "Backend operation failed.");
}

export async function createBackend({
  databasePath,
  generationProviders,
  storageManifest,
}: BackendOptions): Promise<Backend> {
  const applicationLayer = createApplicationLayer([...generationProviders]).pipe(
    Layer.provide(DatabaseService.layer(databasePath)),
  );
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(applicationLayer, StorageService.layer(storageManifest)),
  );
  let application: Application;

  try {
    application = Context.get(await runtime.context(), ApplicationService);
  } catch (cause) {
    try {
      await runtime.dispose();
    } catch (disposeCause) {
      throw new AggregateError(
        [cause, disposeCause],
        "Could not close the backend after it failed to start.",
      );
    }

    throw asError(cause, "Could not start the backend.");
  }

  const measureStorageUsage = StorageService.use((storage) => storage.measureUsage());
  let state: "open" | "closing" | "closed" = "open";
  let closePromise: Promise<void> | undefined;

  function assertOpen() {
    if (state !== "open") {
      throw new Error("Backend is closed.");
    }
  }

  return {
    scenarios: {
      create(title) {
        assertOpen();
        return application.scenarios.create(title);
      },
      list() {
        assertOpen();
        return application.scenarios.list();
      },
      get(id) {
        assertOpen();
        return application.scenarios.get(id);
      },
      rename(id, title) {
        assertOpen();
        return application.scenarios.rename(id, title);
      },
    },
    campaigns: {
      start(scenarioId) {
        assertOpen();
        return application.campaigns.start(scenarioId);
      },
      listForScenario(scenarioId) {
        assertOpen();
        return application.campaigns.listForScenario(scenarioId);
      },
      get(id) {
        assertOpen();
        return application.campaigns.get(id);
      },
    },
    threads: {
      create() {
        assertOpen();
        return application.threads.create();
      },
      get(id) {
        assertOpen();
        return application.threads.get(id);
      },
      startTurn(threadId, content) {
        assertOpen();
        return application.threads.startTurn(threadId, content);
      },
      getTurnContext(turnId) {
        assertOpen();
        return application.threads.getTurnContext(turnId);
      },
      listMessages(request) {
        assertOpen();
        return application.threads.listMessages(request);
      },
    },
    generations: {
      generateReply(request) {
        if (state !== "open") {
          return Promise.reject(new Error("Backend is closed."));
        }

        return application.generations.generateReply(request);
      },
    },
    storage: {
      measureUsage() {
        if (state !== "open") {
          return Promise.reject(new Error("Backend is closed."));
        }

        return unwrapExit(runtime.runPromiseExit(measureStorageUsage));
      },
    },
    close() {
      if (!closePromise) {
        state = "closing";
        closePromise = runtime.dispose().finally(() => {
          state = "closed";
        });
      }

      return closePromise;
    },
  };
}
