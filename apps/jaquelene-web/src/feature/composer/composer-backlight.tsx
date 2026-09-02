import { ErrorSeverity } from "@jaquelene/diagnostics";
import { useReducedMotion } from "@jaquelene/ui/motion";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import {
  effect,
  frame,
  frameLoop,
  init,
  surface,
  type Effect,
  type Frame,
  type FrameLoopHandle,
  type Gpu,
  type Surface,
} from "vgpu";
import { reportError } from "@/feature/diagnostics/diagnostics";
import composerBacklightShader from "./composer-backlight.wgsl";

const backlightOutset = 48;

type ComposerBacklightMode = Readonly<{
  active: boolean;
  reducedMotion: boolean;
}>;

type ComposerBacklightColor = [number, number, number, number];

type ComposerBacklightPalette = [
  ComposerBacklightColor,
  ComposerBacklightColor,
  ComposerBacklightColor,
  ComposerBacklightColor,
];

type ComposerBacklightUniforms = {
  params: {
    resolution: number[];
    time: number;
    border_radius: number;
    outset: number;
    palette_end: number[];
    palette_first_blend: number[];
    palette_second_blend: number[];
    palette_start: number[];
    pixel_scale: number;
  };
};

type ComposerBacklightAttachment = {
  setMode(mode: ComposerBacklightMode): void;
  dispose(): void;
};

type ComposerBacklightEngine = {
  gpu: Gpu;
  effect: Effect;
  uniforms: ComposerBacklightUniforms;
  format: GPUTextureFormat;
  attachment: ComposerBacklightAttachment | undefined;
  stopErrors: () => void;
};

let engine: ComposerBacklightEngine | undefined;
let engineRequest: Promise<ComposerBacklightEngine> | undefined;
let engineEpoch = 0;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function abortError() {
  return new DOMException("Composer backlight initialization was canceled.", "AbortError");
}

function reportBacklightError(operation: string, error: unknown) {
  reportError(operation, error, ErrorSeverity.Warning);
}

async function createEngine(epoch: number) {
  const gpu = await init({ powerPreference: "low-power" });

  if (epoch !== engineEpoch) {
    gpu.dispose();
    throw abortError();
  }

  const stopErrors = gpu.onError((error) =>
    reportBacklightError("composer.backlight.render", error),
  );
  const uniforms: ComposerBacklightUniforms = {
    params: {
      resolution: [1, 1],
      time: 0,
      border_radius: 1,
      outset: 1,
      palette_end: [0, 0, 0, 1],
      palette_first_blend: [0, 0, 0, 1],
      palette_second_blend: [0, 0, 0, 1],
      palette_start: [0, 0, 0, 1],
      pixel_scale: 1,
    },
  };
  const backlightEffect = effect(gpu, composerBacklightShader, {
    label: "composer loading backlight",
    set: uniforms,
  });
  const format = navigator.gpu.getPreferredCanvasFormat();

  try {
    await backlightEffect.compile({ colors: [format], sampleCount: 1 });
  } catch (error) {
    stopErrors();
    gpu.dispose();
    throw error;
  }

  if (epoch !== engineEpoch) {
    stopErrors();
    gpu.dispose();
    throw abortError();
  }

  const created: ComposerBacklightEngine = {
    gpu,
    effect: backlightEffect,
    uniforms,
    format,
    attachment: undefined,
    stopErrors,
  };

  void gpu.gpu.lost.then((information) => {
    if (engine !== created) {
      return;
    }

    engine = undefined;
    engineRequest = undefined;
    created.attachment?.dispose();
    created.stopErrors();
    reportBacklightError(
      "composer.backlight.device-lost",
      new Error(information.message || `WebGPU device was lost (${information.reason}).`),
    );
  });

  return created;
}

function getEngine() {
  if (engine && !engine.gpu.disposed) {
    return Promise.resolve(engine);
  }

  if (engineRequest) {
    return engineRequest;
  }

  const epoch = engineEpoch;
  const request = createEngine(epoch).then(
    (created) => {
      if (engineRequest !== request) {
        created.stopErrors();
        created.gpu.dispose();
        throw abortError();
      }

      engine = created;
      return created;
    },
    (error: unknown) => {
      if (engineRequest === request) {
        engineRequest = undefined;
      }

      throw error;
    },
  );
  engineRequest = request;
  return request;
}

function disposeEngine() {
  engineEpoch += 1;
  const current = engine;
  engine = undefined;
  engineRequest = undefined;
  current?.attachment?.dispose();
  current?.stopErrors();
  current?.gpu.dispose();
}

function readGeometry(host: HTMLElement, canvasSurface: Surface) {
  const radius = Number.parseFloat(getComputedStyle(host).borderTopLeftRadius);
  const pixelScale = canvasSurface.dpr;

  return {
    borderRadius: (Number.isFinite(radius) ? radius : 0) * pixelScale,
    outset: backlightOutset * pixelScale,
    pixelScale,
  };
}

function getComposerHost(canvas: HTMLCanvasElement) {
  const host = canvas.parentElement;

  if (!(host instanceof HTMLFormElement)) {
    throw new Error("The composer backlight canvas must be mounted directly inside its form.");
  }

  return host;
}

function readBacklightPalette(host: HTMLElement) {
  const probe = document.createElement("span");
  probe.ariaHidden = "true";
  probe.style.height = "0";
  probe.style.pointerEvents = "none";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.width = "0";
  host.append(probe);

  const decoder = document.createElement("canvas");
  decoder.height = 1;
  decoder.width = 1;
  const decoderContext = decoder.getContext("2d", { willReadFrequently: true });

  if (!decoderContext) {
    probe.remove();
    throw new Error("The composer backlight could not create a color decoder.");
  }

  const context = decoderContext;

  const paletteClassNames = [
    stylex.props(styles.paletteStart).className,
    stylex.props(styles.paletteFirstBlend).className,
    stylex.props(styles.paletteSecondBlend).className,
    stylex.props(styles.paletteEnd).className,
  ];

  function readColor(className: string | undefined): ComposerBacklightColor {
    if (!className) {
      throw new Error("The composer backlight palette is missing a theme token.");
    }

    probe.className = className;
    const color = getComputedStyle(probe).color;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const channels = context.getImageData(0, 0, 1, 1).data;
    const normalize = (channel: number | undefined) => {
      if (channel === undefined) {
        throw new Error("The composer backlight received an invalid theme color.");
      }

      return channel / 255;
    };

    return [
      normalize(channels[0]),
      normalize(channels[1]),
      normalize(channels[2]),
      normalize(channels[3]),
    ];
  }

  try {
    return [
      readColor(paletteClassNames[0]),
      readColor(paletteClassNames[1]),
      readColor(paletteClassNames[2]),
      readColor(paletteClassNames[3]),
    ] satisfies ComposerBacklightPalette;
  } finally {
    probe.remove();
  }
}

function attachEngine(currentEngine: ComposerBacklightEngine, canvas: HTMLCanvasElement) {
  currentEngine.attachment?.dispose();
  const host = getComposerHost(canvas);

  let active = false;
  let disposed = false;
  let failed = false;
  let placementFrame: number | undefined;
  let reducedMotion = false;
  let startedAt = 0;
  let loop: FrameLoopHandle | undefined;
  const [paletteStart, paletteFirstBlend, paletteSecondBlend, paletteEnd] =
    readBacklightPalette(host);
  const params = currentEngine.uniforms.params;
  params.palette_start.splice(0, 4, ...paletteStart);
  params.palette_first_blend.splice(0, 4, ...paletteFirstBlend);
  params.palette_second_blend.splice(0, 4, ...paletteSecondBlend);
  params.palette_end.splice(0, 4, ...paletteEnd);

  function updatePlacement() {
    if (disposed) {
      return;
    }

    const bounds = host.getBoundingClientRect();
    canvas.style.left = `${bounds.left - backlightOutset}px`;
    canvas.style.top = `${bounds.top - backlightOutset}px`;
    canvas.style.width = `${bounds.width + backlightOutset * 2}px`;
    canvas.style.height = `${bounds.height + backlightOutset * 2}px`;
  }

  function placeCanvas() {
    if (placementFrame !== undefined) {
      cancelAnimationFrame(placementFrame);
      placementFrame = undefined;
    }

    updatePlacement();
  }

  function schedulePlacement() {
    if (active && placementFrame === undefined) {
      placementFrame = requestAnimationFrame(() => {
        placementFrame = undefined;
        updatePlacement();
      });
    }
  }

  placeCanvas();

  const canvasSurface = surface(currentEngine.gpu, canvas, {
    alphaMode: "premultiplied",
    clearColor: [0, 0, 0, 0],
    dpr: [1, 2],
    format: currentEngine.format,
    label: "composer loading backlight",
  });

  const stopResize = canvasSurface.onResize(({ width, height }) => {
    const geometry = readGeometry(host, canvasSurface);
    const params = currentEngine.uniforms.params;
    params.resolution[0] = width;
    params.resolution[1] = height;
    params.border_radius = geometry.borderRadius;
    params.outset = geometry.outset;
    params.pixel_scale = geometry.pixelScale;
  });

  function stopLoop() {
    loop?.stop();
    loop = undefined;
  }

  function render(currentFrame: Frame) {
    currentEngine.uniforms.params.time = reducedMotion
      ? 0.42
      : Math.max(0, (performance.now() - startedAt) / 1000);
    currentEngine.effect.set(currentEngine.uniforms);
    currentFrame.pass(canvasSurface, currentEngine.effect);
  }

  function fail(error: unknown) {
    if (failed || disposed) {
      return;
    }

    failed = true;
    stopLoop();
    reportBacklightError("composer.backlight.draw", error);
  }

  function renderOnce() {
    try {
      frame(currentEngine.gpu, render);
    } catch (error) {
      fail(error);
    }
  }

  function synchronize() {
    stopLoop();

    if (disposed || failed || !active || document.visibilityState !== "visible") {
      return;
    }

    renderOnce();

    if (!reducedMotion && !failed) {
      loop = frameLoop(currentEngine.gpu, (currentFrame) => {
        try {
          render(currentFrame);
        } catch (error) {
          fail(error);
        }
      });
    }
  }

  const resizeObserver = new ResizeObserver(() => {
    if (active && reducedMotion && document.visibilityState === "visible") {
      renderOnce();
    }
  });
  resizeObserver.observe(canvas);
  const positionObserver = new ResizeObserver(schedulePlacement);
  positionObserver.observe(host);
  document.addEventListener("visibilitychange", synchronize);
  document.addEventListener("scroll", schedulePlacement, { capture: true, passive: true });
  window.addEventListener("resize", schedulePlacement, { passive: true });

  const attachment: ComposerBacklightAttachment = {
    setMode(mode) {
      if (active === mode.active && reducedMotion === mode.reducedMotion) {
        return;
      }

      if (!active && mode.active) {
        startedAt = performance.now();
        placeCanvas();
      }

      active = mode.active;
      reducedMotion = mode.reducedMotion;
      synchronize();
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      stopLoop();
      resizeObserver.disconnect();
      positionObserver.disconnect();
      document.removeEventListener("visibilitychange", synchronize);
      document.removeEventListener("scroll", schedulePlacement, true);
      window.removeEventListener("resize", schedulePlacement);

      if (placementFrame !== undefined) {
        cancelAnimationFrame(placementFrame);
      }

      stopResize();
      canvasSurface.dispose();
      canvas.width = 1;
      canvas.height = 1;

      if (currentEngine.attachment === attachment) {
        currentEngine.attachment = undefined;
      }
    },
  };
  currentEngine.attachment = attachment;
  return attachment;
}

function useComposerBacklight(canvas: HTMLCanvasElement | null, mode: ComposerBacklightMode) {
  const attachment = useRef<ComposerBacklightAttachment>(undefined);
  const latestMode = useRef(mode);
  latestMode.current = mode;

  useEffect(() => {
    if (!canvas) {
      return;
    }

    const abort = new AbortController();

    void getEngine()
      .then((currentEngine) => {
        abort.signal.throwIfAborted();
        let nextAttachment: ComposerBacklightAttachment;

        try {
          nextAttachment = attachEngine(currentEngine, canvas);
        } catch (error) {
          reportBacklightError("composer.backlight.attach", error);
          return;
        }

        attachment.current = nextAttachment;
        nextAttachment.setMode(latestMode.current);
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          reportBacklightError("composer.backlight.initialize", error);
        }
      });

    return () => {
      abort.abort();
      attachment.current?.dispose();
      attachment.current = undefined;
    };
  }, [canvas]);

  useEffect(() => {
    attachment.current?.setMode(mode);
  }, [mode.active, mode.reducedMotion]);
}

export function ComposerBacklight({ active }: { active: boolean }) {
  const reducedMotion = useReducedMotion();
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const mode = { active, reducedMotion };
  useComposerBacklight(canvas, mode);

  return (
    <canvas
      ref={setCanvas}
      aria-hidden="true"
      {...stylex.props(styles.canvas, active && styles.active, !reducedMotion && styles.transition)}
    />
  );
}

const styles = stylex.create({
  canvas: {
    height: 0,
    left: 0,
    opacity: 0,
    pointerEvents: "none",
    position: "fixed",
    top: 0,
    width: 0,
    zIndex: 0,
  },
  active: {
    opacity: 1,
  },
  transition: {
    transitionDuration: "0.14s",
    transitionProperty: "opacity",
    transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)",
  },
  paletteStart: {
    color: colors.effectComposerGlowStart,
  },
  paletteFirstBlend: {
    color: colors.effectComposerGlowMiddleStart,
  },
  paletteSecondBlend: {
    color: colors.effectComposerGlowMiddleEnd,
  },
  paletteEnd: {
    color: colors.effectComposerGlowEnd,
  },
});

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", disposeEngine);
  import.meta.hot?.dispose(() => {
    window.removeEventListener("pagehide", disposeEngine);
    disposeEngine();
  });
}
