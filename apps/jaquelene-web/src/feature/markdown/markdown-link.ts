export function normalizeExternalMarkdownHref(href: string | undefined) {
  if (!href) {
    return null;
  }

  try {
    const url = new URL(href);

    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
