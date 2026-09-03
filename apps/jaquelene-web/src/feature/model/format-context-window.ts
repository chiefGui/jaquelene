const compactContextWindowFormatter = new Intl.NumberFormat("en-US", {
  compactDisplay: "short",
  maximumSignificantDigits: 3,
  notation: "compact",
});
const largeContextWindowFormatter = new Intl.NumberFormat("en-US", {
  compactDisplay: "short",
  maximumSignificantDigits: 2,
  notation: "compact",
});

export function formatContextWindowTokens(tokens: number) {
  if (!Number.isSafeInteger(tokens) || tokens <= 0) {
    throw new RangeError("A context window must contain a positive safe integer of tokens.");
  }

  return (tokens >= 1_000_000 ? largeContextWindowFormatter : compactContextWindowFormatter).format(
    tokens,
  );
}
