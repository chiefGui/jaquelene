import * as stylex from "@stylexjs/stylex";

const stops =
  "transparent, rgb(0 0 0 / 10%) calc(var(--edge-fade-size, 1rem) * 0.2), rgb(0 0 0 / 35%) calc(var(--edge-fade-size, 1rem) * 0.4), rgb(0 0 0 / 65%) calc(var(--edge-fade-size, 1rem) * 0.6), rgb(0 0 0 / 90%) calc(var(--edge-fade-size, 1rem) * 0.8), black var(--edge-fade-size, 1rem)";

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
