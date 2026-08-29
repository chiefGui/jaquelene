import { readFileSync } from "node:fs";

const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const productVersion = readFileSync(
  new URL("../../../version.txt", import.meta.url),
  "utf8",
).trim();

if (!stableVersionPattern.test(productVersion)) {
  throw new Error(`Invalid stable product version: ${productVersion}`);
}
