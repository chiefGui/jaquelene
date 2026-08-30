import { clock, effect, frame, frameLoop, init, surface } from "vgpu";
import type { Effect, FrameLoopHandle, Gpu, Surface } from "vgpu";
import ambientInkShader from "./ambient-ink.wgsl";

const STATIC_TIME = 17;
const TARGET_FRAME_RATE = 30;

type InkRenderer = {
  effect: Effect;
  gpu: Gpu;
  surface: Surface;
};

export function mountAmbientInk(canvas: HTMLCanvasElement): () => void {
  const listeners = new AbortController();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = {
    currentX: 0.5,
    currentY: 0.5,
    influence: 0,
    targetInfluence: 0,
    targetX: 0.5,
    targetY: 0.5,
  };

  let animationTime = STATIC_TIME;
  let disposed = false;
  let gpu: Gpu | undefined;
  let loop: FrameLoopHandle | undefined;
  let renderer: InkRenderer | undefined;
  let removeResizeListener: (() => void) | undefined;

  canvas.dataset.ambientInk = "initializing";

  const stop = () => {
    loop?.stop();
    loop = undefined;
  };

  const setStaticPointer = () => {
    pointer.currentX = 0.5;
    pointer.currentY = 0.5;
    pointer.targetX = 0.5;
    pointer.targetY = 0.5;
    pointer.influence = 0;
    pointer.targetInfluence = 0;
  };

  const setFrameUniforms = (ink: Effect, inkSurface: Surface, time: number) => {
    ink.set({
      params: {
        influence: pointer.influence,
        pointer: [pointer.currentX, pointer.currentY],
        time,
        viewport: inkSurface.size,
      },
    });
  };

  const drawStaticFrame = () => {
    const activeRenderer = renderer;
    if (!activeRenderer || document.hidden) return;

    setStaticPointer();
    frame(activeRenderer.gpu, (currentFrame) => {
      setFrameUniforms(activeRenderer.effect, activeRenderer.surface, STATIC_TIME);
      currentFrame.pass(activeRenderer.surface, activeRenderer.effect);
    });
  };

  const start = () => {
    const activeRenderer = renderer;
    if (!activeRenderer || loop || reducedMotion.matches || document.hidden) return;

    const rendererClock = clock(activeRenderer.gpu);
    loop = frameLoop(
      activeRenderer.gpu,
      (currentFrame) => {
        const deltaTime = Math.min(rendererClock.deltaTime, 1 / 15);
        const ease = 1 - Math.exp(-deltaTime * 3.5);

        animationTime += deltaTime;
        pointer.currentX += (pointer.targetX - pointer.currentX) * ease;
        pointer.currentY += (pointer.targetY - pointer.currentY) * ease;
        pointer.influence += (pointer.targetInfluence - pointer.influence) * ease;

        setFrameUniforms(activeRenderer.effect, activeRenderer.surface, animationTime);
        currentFrame.pass(activeRenderer.surface, activeRenderer.effect);
      },
      { fps: TARGET_FRAME_RATE },
    );
  };

  const syncRendering = () => {
    stop();

    if (document.hidden) return;
    if (reducedMotion.matches) drawStaticFrame();
    else start();
  };

  const resetPointer = () => {
    pointer.targetX = 0.5;
    pointer.targetY = 0.5;
    pointer.targetInfluence = 0;
  };

  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch" || reducedMotion.matches) return;

      pointer.targetX = event.clientX / window.innerWidth;
      pointer.targetY = event.clientY / window.innerHeight;
      pointer.targetInfluence = 1;
    },
    { passive: true, signal: listeners.signal },
  );
  window.addEventListener("blur", resetPointer, { signal: listeners.signal });
  document.addEventListener("mouseleave", resetPointer, { signal: listeners.signal });
  document.addEventListener("visibilitychange", syncRendering, { signal: listeners.signal });
  reducedMotion.addEventListener("change", syncRendering, { signal: listeners.signal });
  window.addEventListener(
    "resize",
    () => {
      if (reducedMotion.matches) drawStaticFrame();
    },
    { passive: true, signal: listeners.signal },
  );

  void init({ label: "jaquelene-ambient-ink", powerPreference: "low-power" })
    .then((initializedGpu) => {
      gpu = initializedGpu;

      if (disposed) {
        initializedGpu.dispose();
        gpu = undefined;
        return;
      }

      const inkSurface = surface(initializedGpu, canvas, {
        alphaMode: "opaque",
        clearColor: [0.02, 0.02, 0.03, 1],
        dpr: [1, 1.35],
        label: "ambient-ink-surface",
      });
      const ink = effect(initializedGpu, ambientInkShader, {
        label: "ambient-ink",
        set: {
          params: {
            influence: 0,
            pointer: [0.5, 0.5],
            time: STATIC_TIME,
            viewport: inkSurface.size,
          },
        },
      });

      renderer = { effect: ink, gpu: initializedGpu, surface: inkSurface };
      removeResizeListener = inkSurface.onResize(() => {
        ink.set({ params: { viewport: inkSurface.size } });
      });
      canvas.dataset.ambientInk = "ready";
      syncRendering();
    })
    .catch((error: unknown) => {
      if (disposed) return;

      gpu?.dispose();
      gpu = undefined;
      renderer = undefined;
      canvas.dataset.ambientInk = "unavailable";
      console.warn("The ambient ink renderer could not initialize.", error);
    });

  return () => {
    disposed = true;
    listeners.abort();
    stop();
    removeResizeListener?.();
    gpu?.dispose();
    gpu = undefined;
    renderer = undefined;
    canvas.dataset.ambientInk = "disposed";
  };
}
