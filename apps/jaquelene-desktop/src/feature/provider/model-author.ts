export type ModelAuthorIdentity = Readonly<{
  brandId: string;
  namePrefixes: readonly string[];
}>;

const emptyNamePrefixes: readonly string[] = [];

const authorIdentities: ReadonlyMap<string, ModelAuthorIdentity> = new Map([
  ["arcee-ai", { brandId: "arcee", namePrefixes: emptyNamePrefixes }],
  ["bytedance-seed", { brandId: "bytedance", namePrefixes: emptyNamePrefixes }],
  ["ibm-granite", { brandId: "ibm", namePrefixes: emptyNamePrefixes }],
  ["meta-llama", { brandId: "meta", namePrefixes: emptyNamePrefixes }],
  ["mistralai", { brandId: "mistral", namePrefixes: emptyNamePrefixes }],
  ["moonshotai", { brandId: "moonshot", namePrefixes: emptyNamePrefixes }],
  ["x-ai", { brandId: "x-ai", namePrefixes: ["SpaceXAI"] }],
]);

export function resolveModelAuthor(authorId: string): ModelAuthorIdentity {
  const known = authorIdentities.get(authorId);

  if (known) {
    return known;
  }

  return { brandId: authorId, namePrefixes: emptyNamePrefixes };
}

function normalizeIdentity(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

export function removeKnownAuthorPrefix(
  name: string,
  authorId: string,
  identity: ModelAuthorIdentity,
) {
  const separator = name.indexOf(":");

  if (separator <= 0) {
    return name;
  }

  const prefix = normalizeIdentity(name.slice(0, separator));
  const knownPrefixes = [authorId, identity.brandId, ...identity.namePrefixes];

  if (!knownPrefixes.some((knownPrefix) => normalizeIdentity(knownPrefix) === prefix)) {
    return name;
  }

  return name.slice(separator + 1).trim();
}
