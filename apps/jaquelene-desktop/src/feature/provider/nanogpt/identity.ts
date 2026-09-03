import type { ProviderDescriptor } from "@jaquelene/backend";

export const nanoGptProviderDescriptor = {
  id: "nanogpt",
  name: "NanoGPT",
  brandId: "nanogpt",
} as const satisfies ProviderDescriptor;

export const nanoGptProviderId = nanoGptProviderDescriptor.id;
