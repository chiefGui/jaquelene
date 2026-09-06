export function composeRegenerationConfiguration<Model>(
  defaultModel: Model | null,
): { model: Model } | null {
  if (defaultModel === null) {
    return null;
  }

  return { model: defaultModel };
}
