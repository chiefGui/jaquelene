// Bound each canvas to 16 MiB of RGBA8 pixels, including unusually tall messages.
const maxPixelCount = 2048 * 2048;

export function backlightResolution(
  width: number,
  height: number,
  devicePixelRatio: number,
  maxTextureDimension: number,
): readonly [number, number] {
  const density = Math.min(Math.max(1, devicePixelRatio), 2);
  // Cap axes independently: a tall response should retain detail across its width.
  const pixelWidth = Math.min(width * density, maxTextureDimension);
  const pixelHeight = Math.min(height * density, maxTextureDimension);
  const scale = Math.min(1, Math.sqrt(maxPixelCount / (pixelWidth * pixelHeight)));

  return [
    Math.max(1, Math.floor(pixelWidth * scale)),
    Math.max(1, Math.floor(pixelHeight * scale)),
  ];
}
