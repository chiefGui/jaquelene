import * as z from "zod/mini";

export const ProviderConfigurationKind = Object.freeze({
  ApiKey: "api-key",
  None: "none",
} as const);

export const ProviderConfigurationState = Object.freeze({
  Configured: "configured",
  Unconfigured: "unconfigured",
} as const);

export const ProviderConfigureState = Object.freeze({
  Configured: "configured",
  Rejected: "rejected",
  Unavailable: "unavailable",
} as const);

export const providerKeyLabelSchema = z.string().check(z.trim(), z.minLength(1));

const unconfiguredApiKeyShape = {
  state: z.literal(ProviderConfigurationState.Unconfigured),
};

const configuredApiKeyShape = {
  state: z.literal(ProviderConfigurationState.Configured),
  keyLabel: providerKeyLabelSchema,
};

export const apiKeyProviderConfigurationSchema = z.discriminatedUnion("state", [
  z.strictObject(unconfiguredApiKeyShape),
  z.strictObject(configuredApiKeyShape),
]);

export const providerConfigurationSchema = z.union([
  z.strictObject({
    kind: z.literal(ProviderConfigurationKind.None),
    state: z.literal(ProviderConfigurationState.Configured),
  }),
  z.strictObject({
    kind: z.literal(ProviderConfigurationKind.ApiKey),
    ...unconfiguredApiKeyShape,
  }),
  z.strictObject({
    kind: z.literal(ProviderConfigurationKind.ApiKey),
    ...configuredApiKeyShape,
  }),
]);

export const providerConfigureResultSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal(ProviderConfigureState.Configured),
    keyLabel: providerKeyLabelSchema,
  }),
  z.strictObject({ state: z.literal(ProviderConfigureState.Rejected) }),
  z.strictObject({ state: z.literal(ProviderConfigureState.Unavailable) }),
]);

export type ApiKeyProviderConfiguration = Readonly<
  z.output<typeof apiKeyProviderConfigurationSchema>
>;
export type ProviderConfiguration = Readonly<z.output<typeof providerConfigurationSchema>>;
export type ProviderConfigureResult = Readonly<z.output<typeof providerConfigureResultSchema>>;
