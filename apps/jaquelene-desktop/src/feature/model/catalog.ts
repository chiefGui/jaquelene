import {
  requireModelReference,
  type ModelProvider,
  type ModelReference,
  type Models,
  type ProviderModel,
} from "@jaquelene/backend";

export {
  requireModelReference,
  type ModelProvider,
  type ModelReference,
  type ProviderModel as AvailableModel,
};

type AvailableModel = ProviderModel;

export type ModelSelection = ModelReference & Pick<AvailableModel, "brandId" | "name">;

export function requireModelSelection(selection: ModelSelection) {
  requireModelReference(selection);

  if (!selection.name.trim() || !selection.brandId.trim()) {
    throw new TypeError("A model selection requires display metadata.");
  }
}

export type ModelCatalog = Models;
