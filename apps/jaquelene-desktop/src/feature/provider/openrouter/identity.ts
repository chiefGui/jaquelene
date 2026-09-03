import type { ProviderDescriptor } from "@jaquelene/backend";

export const openRouterProviderDescriptor = {
  id: "openrouter",
  name: "OpenRouter",
  brandId: "openrouter",
} as const satisfies ProviderDescriptor;

export const openRouterProviderId = openRouterProviderDescriptor.id;
