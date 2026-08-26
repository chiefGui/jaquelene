const byteUnits = ["bytes", "KB", "MB", "GB", "TB", "PB"] as const;
const byteNumberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

export function formatBytes(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new RangeError("Byte count must be a non-negative safe integer.");
  }

  if (bytes === 1) {
    return "1 byte";
  }

  if (bytes < 1_000) {
    return `${bytes} bytes`;
  }

  let unitIndex = 0;
  let value = bytes;

  while (value >= 1_000 && unitIndex < byteUnits.length - 1) {
    value /= 1_000;
    unitIndex += 1;
  }

  value = Math.round(value * 10) / 10;

  if (value >= 1_000 && unitIndex < byteUnits.length - 1) {
    value /= 1_000;
    unitIndex += 1;
  }

  return `${byteNumberFormat.format(value)} ${byteUnits[unitIndex]}`;
}
