import type { Schema } from "electron-store";
import type { ModelSelection } from "./catalog";

export const modelSelectionStorageSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    providerId: { type: "string", minLength: 1 },
    modelId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    brandId: { type: "string", minLength: 1 },
  },
  required: ["providerId", "modelId", "name", "brandId"],
} satisfies Schema<{ model: ModelSelection }>["model"];
