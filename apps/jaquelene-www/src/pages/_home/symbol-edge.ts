import { clock, effect, frame, frameLoop, init, surface } from "vgpu";
import type { Effect, FrameLoopHandle, Gpu, Surface } from "vgpu";
import { palette } from "@jaquelene/ui/theme.stylex";
import symbolEdgeShader from "./symbol-edge.wgsl";

const STATIC_TIME = 11;
const TARGET_FRAME_RATE = 24;
const OKLCH_PATTERN =
  /^oklch\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)$/;

type DisplayRgb = [number, number, number];

type SymbolEdgeRenderer = {
  effect: Effect;
  gpu: Gpu;
  surface: Surface;
};

function encodeSrgb(linearChannel: number): number {
  const channel = Math.min(Math.max(linearChannel, 0), 1);
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function oklchToDisplayRgb(color: string): DisplayRgb {
  const match = OKLCH_PATTERN.exec(color);
  if (!match) throw new Error(`Expected an opaque OKLCH color, received "${color}".`);

  const lightness = Number(match[1]);
  const chroma = Number(match[2]);
  const hue = (Number(match[3]) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;

  return [
    encodeSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encodeSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encodeSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function mountSymbolEdge(canvas: HTMLCanvasElement): () => void {
  const listeners = new AbortController();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const shaderPalette = {
    accent: oklchToDisplayRgb(palette.accent),
    foreground: oklchToDisplayRgb(palette.foreground),
    reasoning: oklchToDisplayRgb(palette.reasoning),
  };

  let animationTime = STATIC_TIME;
  let disposed = false;
  let gpu: Gpu | undefined;
  let loop: FrameLoopHandle | undefined;
  let renderer: SymbolEdgeRenderer | undefined;
  let removeResizeListener: (() => void) | undefined;

  canvas.dataset.symbolEdge = "initializing";

  const stop = () => {
    loop?.stop();
    loop = undefined;
  };

  const drawFrame = (time: number) => {
    const activeRenderer = renderer;
    if (!activeRenderer || document.hidden) return;

    frame(activeRenderer.gpu, (currentFrame) => {
      activeRenderer.effect.set({
        params: {
          time,
          viewport: activeRenderer.surface.size,
        },
      });
      currentFrame.pass(activeRenderer.surface, activeRenderer.effect);
    });

    canvas.dataset.symbolEdge = "ready";
  };

  const start = () => {
    const activeRenderer = renderer;
    if (!activeRenderer || loop || reducedMotion.matches || document.hidden) return;

    drawFrame(animationTime);
    const rendererClock = clock(activeRenderer.gpu);
    loop = frameLoop(
      activeRenderer.gpu,
      (currentFrame) => {
        animationTime += Math.min(rendererClock.deltaTime, 1 / 15);
        activeRenderer.effect.set({
          params: {
            time: animationTime,
            viewport: activeRenderer.surface.size,
          },
        });
        currentFrame.pass(activeRenderer.surface, activeRenderer.effect);
      },
      { fps: TARGET_FRAME_RATE },
    );
  };

  const syncRendering = () => {
    stop();
    if (document.hidden) return;

    if (reducedMotion.matches) drawFrame(STATIC_TIME);
    else start();
  };

  document.addEventListener("visibilitychange", syncRendering, { signal: listeners.signal });
  reducedMotion.addEventListener("change", syncRendering, { signal: listeners.signal });

  void init({ label: "jaquelene-symbol-edge", powerPreference: "low-power" })
    .then((initializedGpu) => {
      gpu = initializedGpu;

      if (disposed) {
        initializedGpu.dispose();
        gpu = undefined;
        return;
      }

      const edgeSurface = surface(initializedGpu, canvas, {
        alphaMode: "premultiplied",
        clearColor: [0, 0, 0, 0],
        dpr: [1, 2],
        label: "symbol-edge-surface",
      });
      const edgeEffect = effect(initializedGpu, symbolEdgeShader, {
        label: "symbol-edge",
        set: {
          palette: shaderPalette,
          params: {
            time: STATIC_TIME,
            viewport: edgeSurface.size,
          },
        },
      });

      renderer = {
        effect: edgeEffect,
        gpu: initializedGpu,
        surface: edgeSurface,
      };
      removeResizeListener = edgeSurface.onResize(() => {
        edgeEffect.set({ params: { viewport: edgeSurface.size } });
        if (reducedMotion.matches) drawFrame(STATIC_TIME);
      });
      syncRendering();
    })
    .catch((error: unknown) => {
      if (disposed) return;

      gpu?.dispose();
      gpu = undefined;
      renderer = undefined;
      canvas.dataset.symbolEdge = "unavailable";
      console.warn("The symbol edge renderer could not initialize.", error);
    });

  return () => {
    disposed = true;
    listeners.abort();
    stop();
    removeResizeListener?.();
    gpu?.dispose();
    gpu = undefined;
    renderer = undefined;
    canvas.dataset.symbolEdge = "disposed";
  };
}
