import symbolGeometry from "@jaquelene/brand/symbol.svg?raw";
import {
  symbolSquirclePath,
  symbolSquircleViewBox,
} from "@jaquelene/brand/symbol-squircle";
import { palette } from "@jaquelene/ui/theme.stylex";

export const prerender = true;

const rootStart = symbolGeometry.indexOf(">");
const rootEnd = symbolGeometry.lastIndexOf("</svg>");

if (rootStart === -1 || rootEnd <= rootStart) {
  throw new Error("The canonical symbol is not a complete SVG document.");
}

const geometry = symbolGeometry.slice(rootStart + 1, rootEnd);
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbolSquircleViewBox}" shape-rendering="geometricPrecision"><defs>${geometry}<clipPath id="squircle"><path d="${symbolSquirclePath}"/></clipPath></defs><path d="${symbolSquirclePath}" fill="${palette.foreground}"/><g clip-path="url(#squircle)" fill="${palette.canvas}"><use href="#geometry"/></g></svg>`;

export function GET() {
  return new Response(favicon, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
  });
}
