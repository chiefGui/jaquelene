import { describe, expect, it } from "vite-plus/test";

const sourceModules = import.meta.glob<string>(
  ["../../../**/*.{css,ts,tsx}", "../../../../../../packages/ui/src/**/*.{css,ts,tsx}"],
  { eager: true, import: "default", query: "?raw" },
);

const rawColorAllowlist = [
  "/packages/ui/src/theme/dracula.ts",
  "/packages/ui/src/tokens.stylex.ts",
];

const forbiddenSyntax = [
  { label: "hex", pattern: /#[\da-f]{3,8}\b/iu },
  { label: "RGB", pattern: /\brgba?\(/iu },
  { label: "HSL", pattern: /\bhsla?\(/iu },
  { label: "non-OKLCH color interpolation", pattern: /color-mix\(in (?!oklch)/iu },
];

describe("theme color policy", () => {
  it("keeps authored colors in the theme boundary and in OKLCH", () => {
    const violations: string[] = [];

    for (const [path, source] of Object.entries(sourceModules)) {
      if (path.includes(".test.")) {
        continue;
      }

      for (const syntax of forbiddenSyntax) {
        if (syntax.pattern.test(source)) {
          violations.push(`${path}: ${syntax.label}`);
        }
      }

      const allowsRawColor = rawColorAllowlist.some((allowedPath) => path.endsWith(allowedPath));
      if (!allowsRawColor && /oklch\(/iu.test(source)) {
        violations.push(`${path}: raw OKLCH color outside the theme boundary`);
      }
    }

    expect(violations.sort()).toEqual([]);
  });

  it("authors every theme token value in OKLCH", () => {
    const violations: string[] = [];

    for (const [path, source] of Object.entries(sourceModules)) {
      if (!rawColorAllowlist.some((allowedPath) => path.endsWith(allowedPath))) {
        continue;
      }

      const colorSource = path.endsWith("/packages/ui/src/tokens.stylex.ts")
        ? source.slice(source.indexOf("export const colors"), source.indexOf("export const tokens"))
        : source;
      const assignments = [...colorSource.matchAll(/^\s+([a-z]\w+):\s+(.+),$/gmu)];

      if (assignments.length === 0) {
        violations.push(`${path}: no theme color values found`);
        continue;
      }

      for (const [, name, value] of assignments) {
        if (name === undefined || value === undefined || !/^"oklch\([^"]+\)"$/u.test(value)) {
          violations.push(`${path}: ${name ?? "unknown"}`);
        }
      }
    }

    expect(violations.sort()).toEqual([]);
  });
});
