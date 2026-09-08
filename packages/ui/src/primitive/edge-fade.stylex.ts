import * as stylex from "@stylexjs/stylex";

const stops =
  "transparent, oklch(from currentColor l c h / 10%) calc(var(--edge-fade-size, 1rem) * 0.2), oklch(from currentColor l c h / 35%) calc(var(--edge-fade-size, 1rem) * 0.4), oklch(from currentColor l c h / 65%) calc(var(--edge-fade-size, 1rem) * 0.6), oklch(from currentColor l c h / 90%) calc(var(--edge-fade-size, 1rem) * 0.8), black var(--edge-fade-size, 1rem)";

export const edgeFadeMasks = stylex.defineConsts({
  start: `linear-gradient(to bottom, ${stops})`,
  end: `linear-gradient(to top, ${stops})`,
  both: `linear-gradient(to bottom, ${stops}), linear-gradient(to top, ${stops})`,
});

export const edgeFade = stylex.create({
  start: {
    maskImage: edgeFadeMasks.start,
  },
  end: {
    maskImage: edgeFadeMasks.end,
  },
  both: {
    maskImage: edgeFadeMasks.both,
    maskComposite: "intersect",
  },
});
