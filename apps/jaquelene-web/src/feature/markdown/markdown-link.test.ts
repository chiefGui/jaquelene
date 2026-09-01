import { describe, expect, it } from "vite-plus/test";
import { normalizeExternalMarkdownHref } from "./markdown-link";

describe("external Markdown links", () => {
  it("normalizes HTTP and HTTPS destinations", () => {
    expect(normalizeExternalMarkdownHref("https://example.com/story?q=one#scene")).toBe(
      "https://example.com/story?q=one#scene",
    );
    expect(normalizeExternalMarkdownHref("http://example.com")).toBe("http://example.com/");
  });

  it.each([
    undefined,
    "",
    "/relative",
    "#fragment",
    "mailto:reader@example.com",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "not a URL",
  ])("rejects unsupported destination %s", (href) => {
    expect(normalizeExternalMarkdownHref(href)).toBeNull();
  });
});
