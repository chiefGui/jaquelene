import { Context, Effect, Layer, Predicate, Schema } from "effect";
import type { RequestedModelConfiguration } from "#backend/model/configuration";
import { requireRequestedModelConfiguration } from "#backend/model/configuration";
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

export type InferenceRequest = Readonly<{
  executionId: string;
  groupId?: string;
  configuration: ResolvedModelConfiguration;
  input: ModelInput;
}>;

export type InferenceResult =
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

const inferenceErrorFields = {
  cause: Schema.Defect(),
};

export class ModelConfigurationError extends Schema.TaggedError<ModelConfigurationError>()(
  "ModelConfigurationError",
  inferenceErrorFields,
) {
  override get message() {
    return messageForCause(this.cause, "Could not resolve model configuration.");
  }
}

export class InferenceRequestError extends Schema.TaggedError<InferenceRequestError>()(
  "InferenceRequestError",
  inferenceErrorFields,
) {
  override get message() {
    return messageForCause(this.cause, "The model execution request is invalid.");
  }
}

export class ModelProviderError extends Schema.TaggedError<ModelProviderError>()(
  "ModelProviderError",
  inferenceErrorFields,
) {
  override get message() {
    return messageForCause(this.cause, "The model provider failed.");
  }
}

export type InferenceError = InferenceRequestError | ModelProviderError;

export type Inference = Readonly<{
  resolveConfiguration: (
    configuration: RequestedModelConfiguration,
  ) => Effect.Effect<ResolvedModelConfiguration, ModelConfigurationError>;
  execute: (request: InferenceRequest) => Effect.Effect<InferenceResult, InferenceError>;
}>;

export type InferenceRunner = Readonly<{
  resolveConfiguration: (
    configuration: RequestedModelConfiguration,
    signal?: AbortSignal,
  ) => Promise<ResolvedModelConfiguration>;
  execute: (request: InferenceRequest, signal?: AbortSignal) => Promise<InferenceResult>;
}>;

type RunModelEffect = <Success, Failure>(
  effect: Effect.Effect<Success, Failure>,
  options: Readonly<{ signal: AbortSignal | undefined }>,
) => Promise<Success>;

function interruptionCause(signal: AbortSignal) {
  if (Predicate.isError(signal.reason)) {
    return signal.reason;
  }

  return new Error("Model execution was interrupted.", { cause: signal.reason });
}

function messageForCause(cause: unknown, fallback: string) {
  if (Predicate.isError(cause) && cause.message) {
    return cause.message;
  }

  return fallback;
}

function configurationError(cause: unknown) {
  return new ModelConfigurationError({ cause });
}

function requestError(cause: unknown) {
  return new InferenceRequestError({ cause });
}

function providerError(cause: unknown) {
  return new ModelProviderError({ cause });
}

export function createInferenceRunner(
  executor: Inference,
  runModelEffect: RunModelEffect,
): InferenceRunner {
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
    throw new RangeError(`Unknown model provider "${model.providerId}".`);
  }

  return provider;
}

function copyRequestedModelConfiguration(
  configuration: RequestedModelConfiguration,
): RequestedModelConfiguration {
  const copy: {
    model: ModelReference;
    reasoningPreset?: NonNullable<RequestedModelConfiguration["reasoningPreset"]>;
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

function requireExecutionCorrelation(request: Pick<InferenceRequest, "executionId" | "groupId">) {
  if (!request.executionId.trim()) {
    throw new TypeError("A model execution requires an execution identity.");
  }

  if (request.groupId !== undefined && !request.groupId.trim()) {
    throw new TypeError("A model execution group identity must contain text.");
  }
}

export function requireInferenceRequest(request: InferenceRequest): InferenceRequest {
  requireExecutionCorrelation(request);
  const validated: {
    executionId: string;
    groupId?: string;
    configuration: ResolvedModelConfiguration;
    input: ModelInput;
  } = {
    executionId: request.executionId,
    configuration: requireResolvedModelConfiguration(request.configuration),
    input: requireModelInput(request.input),
  };

  if (request.groupId !== undefined) {
    validated.groupId = request.groupId;
  }

  return validated;
}

function toProviderRequest(request: InferenceRequest): ProviderGenerationRequest {
  const providerRequest: {
    executionId: string;
    groupId?: string;
    modelId: string;
    input: ModelInput;
    reasoning?: ResolvedReasoning;
  } = {
    executionId: request.executionId,
    modelId: request.configuration.model.modelId,
    input: request.input,
  };

  if (request.groupId !== undefined) {
    providerRequest.groupId = request.groupId;
  }

  if (request.configuration.reasoning !== undefined) {
    providerRequest.reasoning = request.configuration.reasoning;
  }

  return providerRequest;
}

export function createInference(
  models: Pick<Models, "getModel">,
  providers: ProviderGenerationRouter,
): Inference {
  const resolveConfiguration = Effect.fn("Inference.resolveConfiguration")(function* (
    requestedConfiguration: RequestedModelConfiguration,
  ) {
    const configuration = yield* Effect.try({
      try: () => {
        const copied = copyRequestedModelConfiguration(requestedConfiguration);
        requireRequestedModelConfiguration(copied);
        requireProvider(providers, copied.model);
        return copied;
      },
      catch: configurationError,
    });
    const model = yield* Effect.tryPromise({
      try: (signal) => models.getModel(configuration.model, signal),
      catch: configurationError,
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
      catch: configurationError,
    });
  });

  const execute = Effect.fn("Inference.execute")(function* (request: InferenceRequest) {
    const validated = yield* Effect.try({
      try: () => requireInferenceRequest(request),
      catch: requestError,
    });
    const provider = yield* Effect.try({
      try: () => requireProvider(providers, validated.configuration.model),
      catch: providerError,
    });
    const providerResult = yield* Effect.tryPromise({
      try: (signal) => provider.generate(toProviderRequest(validated), signal),
      catch: providerError,
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

export class InferenceService extends Context.Service<InferenceService, Inference>()(
  "@jaquelene/backend/Inference",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const providers = yield* ProvidersService;
      return InferenceService.of(createInference(providers.models, providers.generations));
    }),
  );
}
