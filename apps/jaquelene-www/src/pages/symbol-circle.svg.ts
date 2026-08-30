import symbolSource from "@jaquelene/brand/symbol.svg?raw";

export const prerender = true;

const rootEnd = symbolSource.indexOf(">");
const rootClose = symbolSource.lastIndexOf("</svg>");

if (rootEnd === -1 || rootClose <= rootEnd) {
  throw new Error("The canonical brand symbol is not a complete SVG document.");
}

const symbolContents = symbolSource.slice(rootEnd + 1, rootClose);
const symbolCircle = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0.5 10.6 428 428"><defs><mask id="circle" maskUnits="userSpaceOnUse" x=".5" y="10.6" width="428" height="428"><circle cx="214.5" cy="224.6" r="214" fill="#fff"/></mask></defs><g mask="url(#circle)"><path fill="#fff" d="M.5 10.6h428v428H.5z"/><g fill="#000">${symbolContents}</g></g></svg>`;

export function GET() {
  return new Response(symbolCircle, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
  });
}
