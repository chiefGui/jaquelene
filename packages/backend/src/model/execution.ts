import { Context, Effect, Layer } from "effect";
import type { GenerationConfiguration } from "#backend/model/configuration";
import { requireGenerationConfiguration } from "#backend/model/configuration";
import { requireModelInput, type ModelInput } from "#backend/model/input";
import {
  requireResolvedReasoning,
  resolveReasoning,
  type ResolvedReasoning,
} from "#backend/model/reasoning";
import type { Models } from "#backend/provider/model-catalog";
import {
  requireModelReference,
  type ModelReference,
  type ProviderGenerationRequest,
} from "#backend/provider/provider";
import { ProvidersService, type ProviderGenerationRouter } from "#backend/provider/providers";
import { normalizeProviderAccounting, type ProviderAccounting } from "#backend/provider/accounting";

export type ResolvedModelConfiguration = Readonly<{
  model: ModelReference;
  reasoning?: ResolvedReasoning;
}>;

export type ModelExecutionRequest = Readonly<{
  operationId: string;
  conversationId?: string;
  configuration: ResolvedModelConfiguration;
  input: ModelInput;
}>;

export type ModelExecutionResult =
  | Readonly<{
      outcome: "completed";
      text: string;
      accounting: ProviderAccounting;
    }>
  | Readonly<{
      outcome: "invalid-accounting";
      cause: unknown;
      accounting: ProviderAccounting;
    }>;

export type ModelExecutor = Readonly<{
  resolveConfiguration: (
    configuration: GenerationConfiguration,
  ) => Effect.Effect<ResolvedModelConfiguration, unknown>;
  execute: (request: ModelExecutionRequest) => Effect.Effect<ModelExecutionResult, unknown>;
}>;

export type ModelExecutionRunner = Readonly<{
  resolveConfiguration: (
    configuration: GenerationConfiguration,
    signal?: AbortSignal,
  ) => Promise<ResolvedModelConfiguration>;
  execute: (request: ModelExecutionRequest, signal?: AbortSignal) => Promise<ModelExecutionResult>;
}>;

type RunModelEffect = <Success, Failure>(
  effect: Effect.Effect<Success, Failure>,
  options: Readonly<{ signal: AbortSignal | undefined }>,
) => Promise<Success>;

function interruptionCause(signal: AbortSignal) {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }

  return new Error("Model execution was interrupted.", { cause: signal.reason });
}

export function createModelExecutionRunner(
  executor: ModelExecutor,
  runModelEffect: RunModelEffect,
): ModelExecutionRunner {
  function run<Success, Failure>(effect: Effect.Effect<Success, Failure>, signal?: AbortSignal) {
    const running = runModelEffect(effect, { signal });

    if (!signal) {
      return running;
    }

    return running.catch((cause: unknown) => {
      if (signal.aborted) {
        throw interruptionCause(signal);
      }

      throw cause;
    });
  }

  return {
    resolveConfiguration(configuration, signal) {
      return run(executor.resolveConfiguration(configuration), signal);
    },
    execute(request, signal) {
      return run(executor.execute(request), signal);
    },
  };
}

function requireProvider(providers: ProviderGenerationRouter, model: ModelReference) {
  requireModelReference(model);
  const provider = providers.get(model.providerId);

  if (!provider) {
    throw new RangeError(`Unknown generation provider "${model.providerId}".`);
  }

  return provider;
}

function copyConfiguration(configuration: GenerationConfiguration): GenerationConfiguration {
  const copy: {
    model: ModelReference;
    reasoningPreset?: NonNullable<GenerationConfiguration["reasoningPreset"]>;
  } = {
    model: {
      providerId: configuration.model.providerId,
      modelId: configuration.model.modelId,
    },
  };

  if (configuration.reasoningPreset !== undefined) {
    copy.reasoningPreset = configuration.reasoningPreset;
  }

  return copy;
}

export function requireResolvedModelConfiguration(
  configuration: ResolvedModelConfiguration,
): ResolvedModelConfiguration {
  const copy: {
    model: ModelReference;
    reasoning?: ResolvedReasoning;
  } = {
    model: {
      providerId: configuration.model.providerId,
      modelId: configuration.model.modelId,
    },
  };

  requireModelReference(copy.model);

  if (configuration.reasoning !== undefined) {
    copy.reasoning = requireResolvedReasoning(configuration.reasoning);
  }

  return copy;
}

function requireCorrelation(
  request: Pick<ModelExecutionRequest, "operationId" | "conversationId">,
) {
  if (!request.operationId.trim()) {
    throw new TypeError("A model execution requires an operation identity.");
  }

  if (request.conversationId !== undefined && !request.conversationId.trim()) {
    throw new TypeError("A model execution conversation identity must contain text.");
  }
}

function toProviderRequest(
  request: ModelExecutionRequest,
  configuration: ResolvedModelConfiguration,
  input: ModelInput,
): ProviderGenerationRequest {
  const providerRequest: {
    operationId: string;
    conversationId?: string;
    modelId: string;
    input: ModelInput;
    reasoning?: ResolvedReasoning;
  } = {
    operationId: request.operationId,
    modelId: configuration.model.modelId,
    input,
  };

  if (request.conversationId !== undefined) {
    providerRequest.conversationId = request.conversationId;
  }

  if (configuration.reasoning !== undefined) {
    providerRequest.reasoning = configuration.reasoning;
  }

  return providerRequest;
}

export function createModelExecutor(
  models: Pick<Models, "getModel">,
  providers: ProviderGenerationRouter,
): ModelExecutor {
  const resolveConfiguration = Effect.fn("ModelExecutor.resolveConfiguration")(function* (
    requestedConfiguration: GenerationConfiguration,
  ) {
    const configuration = yield* Effect.try({
      try: () => {
        const copied = copyConfiguration(requestedConfiguration);
        requireGenerationConfiguration(copied);
        requireProvider(providers, copied.model);
        return copied;
      },
      catch: (cause) => cause,
    });
    const model = yield* Effect.tryPromise({
      try: (signal) => models.getModel(configuration.model, signal),
      catch: (cause) => cause,
    });

    return yield* Effect.try({
      try: () => {
        const resolved: {
          model: ModelReference;
          reasoning?: ResolvedReasoning;
        } = {
          model: {
            providerId: configuration.model.providerId,
            modelId: configuration.model.modelId,
          },
        };
        const reasoning = resolveReasoning(model.reasoning, configuration.reasoningPreset);

        if (reasoning !== undefined) {
          resolved.reasoning = reasoning;
        }

        return resolved;
      },
      catch: (cause) => cause,
    });
  });

  const execute = Effect.fn("ModelExecutor.execute")(function* (request: ModelExecutionRequest) {
    const prepared = yield* Effect.try({
      try: () => {
        requireCorrelation(request);
        const configuration = requireResolvedModelConfiguration(request.configuration);
        const input = requireModelInput(request.input);
        const provider = requireProvider(providers, configuration.model);
        return { configuration, input, provider };
      },
      catch: (cause) => cause,
    });
    const providerResult = yield* Effect.tryPromise({
      try: (signal) =>
        prepared.provider.generate(
          toProviderRequest(request, prepared.configuration, prepared.input),
          signal,
        ),
      catch: (cause) => cause,
    });
    const normalized = normalizeProviderAccounting(providerResult);

    if (normalized.outcome === "invalid") {
      return {
        outcome: "invalid-accounting" as const,
        cause: normalized.cause,
        accounting: normalized.accounting,
      };
    }

    return {
      outcome: "completed" as const,
      text: providerResult.text,
      accounting: normalized.accounting,
    };
  });

  return { resolveConfiguration, execute };
}

export class ModelExecutionService extends Context.Service<ModelExecutionService, ModelExecutor>()(
  "@jaquelene/backend/ModelExecution",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const providers = yield* ProvidersService;
      return ModelExecutionService.of(createModelExecutor(providers.models, providers.generations));
    }),
  );
}
