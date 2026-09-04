import { describe, expect, it } from "vite-plus/test";
import {
  apiKeyProviderConfigurationSchema,
  providerConfigurationSchema,
  providerConfigureResultSchema,
} from "./configuration";

describe("provider configuration", () => {
  it.each([
    { kind: "none", state: "unconfigured" },
    { kind: "none", state: "configured", keyLabel: "key...1234" },
    { kind: "api-key", state: "unconfigured", keyLabel: "key...1234" },
    { kind: "api-key", state: "configured" },
    { kind: "api-key", state: "configured", keyLabel: " " },
  ])("rejects the invalid provider configuration %j", (configuration) => {
    expect(providerConfigurationSchema.safeParse(configuration).success).toBe(false);
  });

  it("accepts each valid API-key configuration state", () => {
    expect(apiKeyProviderConfigurationSchema.safeParse({ state: "unconfigured" }).success).toBe(
      true,
    );
    expect(
      apiKeyProviderConfigurationSchema.safeParse({
        state: "configured",
        keyLabel: "key...1234",
      }).success,
    ).toBe(true);
  });

  it.each([
    { state: "configured" },
    { state: "configured", keyLabel: "" },
    { state: "rejected", keyLabel: "key...1234" },
    { state: "future" },
  ])("rejects the invalid configuration result %j", (result) => {
    expect(providerConfigureResultSchema.safeParse(result).success).toBe(false);
  });
});
