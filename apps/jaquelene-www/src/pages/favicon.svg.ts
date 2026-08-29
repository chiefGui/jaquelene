import symbolSource from "@jaquelene/brand/symbol.svg?raw";

export const prerender = true;

const rootEnd = symbolSource.indexOf(">");
const rootClose = symbolSource.lastIndexOf("</svg>");

if (rootEnd === -1 || rootClose === -1) {
  throw new Error("The canonical brand symbol is not a complete SVG document.");
}

const symbolContents = symbolSource.slice(rootEnd + 1, rootClose);
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0.5 10.6 428 428"><defs><clipPath id="circle"><circle cx="214.5" cy="224.6" r="214"/></clipPath></defs><circle cx="214.5" cy="224.6" r="214" fill="#fff"/><g clip-path="url(#circle)" fill="#000">${symbolContents}</g></svg>`;

export function GET() {
  return new Response(favicon, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
  });
}
