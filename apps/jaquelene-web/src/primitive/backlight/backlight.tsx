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
} from "vgpu";
import { reportError } from "@/feature/diagnostics/diagnostics";
import backlightShader from "./backlight.wgsl";
import { backlightResolution } from "./backlight-resolution";

const backlightOutset = 48;
const backlightFadeMs = 140;

type BacklightMode = Readonly<{
  active: boolean;
  reducedMotion: boolean;
}>;

type BacklightColor = [number, number, number, number];

type BacklightPalette = [BacklightColor, BacklightColor, BacklightColor, BacklightColor];

type BacklightUniforms = {
  params: {
    resolution: [number, number];
    time: number;
    border_radius: number;
    outset: number;
    palette_end: number[];
    palette_first_blend: number[];
    palette_second_blend: number[];
    palette_start: number[];
  };
};

type BacklightAttachment = {
  setMode(mode: BacklightMode): void;
  dispose(): void;
};

type BacklightEngine = {
  gpu: Gpu;
  effect: Effect;
  format: GPUTextureFormat;
  attachments: Set<BacklightAttachment>;
  stopErrors: () => void;
};

let engine: BacklightEngine | undefined;
let engineRequest: Promise<BacklightEngine> | undefined;
let engineEpoch = 0;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function abortError() {
  return new DOMException("Backlight initialization was canceled.", "AbortError");
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

  const stopErrors = gpu.onError((error) => reportBacklightError("backlight.render", error));
  const backlightEffect = effect(gpu, backlightShader, {
    label: "loading backlight",
    set: createUniforms(),
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

  const created: BacklightEngine = {
    gpu,
    effect: backlightEffect,
    format,
    attachments: new Set(),
    stopErrors,
  };

  void gpu.gpu.lost.then((information) => {
    if (engine !== created) {
      return;
    }

    engine = undefined;
    engineRequest = undefined;
    for (const attachment of created.attachments) {
      attachment.dispose();
    }
    created.stopErrors();
    reportBacklightError(
      "backlight.device-lost",
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
  if (current) {
    for (const attachment of current.attachments) {
      attachment.dispose();
    }
  }
  current?.stopErrors();
  current?.gpu.dispose();
}

function createUniforms(): BacklightUniforms {
  return {
    params: {
      resolution: [1, 1],
      time: 0,
      border_radius: 1,
      outset: backlightOutset,
      palette_end: [0, 0, 0, 1],
      palette_first_blend: [0, 0, 0, 1],
      palette_second_blend: [0, 0, 0, 1],
      palette_start: [0, 0, 0, 1],
    },
  };
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
    throw new Error("The backlight could not create a color decoder.");
  }

  const context = decoderContext;

  const paletteClassNames = [
    stylex.props(styles.paletteStart).className,
    stylex.props(styles.paletteFirstBlend).className,
    stylex.props(styles.paletteSecondBlend).className,
    stylex.props(styles.paletteEnd).className,
  ];

  function readColor(className: string | undefined): BacklightColor {
    if (!className) {
      throw new Error("The backlight palette is missing a theme token.");
    }

    probe.className = className;
    const color = getComputedStyle(probe).color;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const channels = context.getImageData(0, 0, 1, 1).data;
    const normalize = (channel: number | undefined) => {
      if (channel === undefined) {
        throw new Error("The backlight received an invalid theme color.");
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
    ] satisfies BacklightPalette;
  } finally {
    probe.remove();
  }
}

function attachEngine(currentEngine: BacklightEngine, canvas: HTMLCanvasElement) {
  const container = canvas.parentElement;
  const host = container?.parentElement;

  if (!container || !host) {
    throw new Error("The backlight must be mounted inside its positioned host.");
  }

  let active = false;
  let disposed = false;
  let failed = false;
  let visible = false;
  let reducedMotion = false;
  let startedAt = 0;
  let loop: FrameLoopHandle | undefined;
  const uniforms = createUniforms();
  const params = uniforms.params;
  const [paletteStart, paletteFirstBlend, paletteSecondBlend, paletteEnd] =
    readBacklightPalette(host);
  params.palette_start = paletteStart;
  params.palette_first_blend = paletteFirstBlend;
  params.palette_second_blend = paletteSecondBlend;
  params.palette_end = paletteEnd;

  const readGeometry = () => {
    const style = getComputedStyle(host);
    const radius = Number.parseFloat(style.borderTopLeftRadius);
    params.border_radius = 0;
    if (Number.isFinite(radius)) {
      params.border_radius = radius;
    }

    // Absolute positioning uses the padding box. Include the host's border too.
    container.style.top = `-${style.borderTopWidth}`;
    container.style.right = `-${style.borderRightWidth}`;
    container.style.bottom = `-${style.borderBottomWidth}`;
    container.style.left = `-${style.borderLeftWidth}`;
    // Keep shader geometry in CSS pixels so limiting the raster size does not
    // change the shape, border radius, or glow width.
    params.resolution[0] = host.offsetWidth + backlightOutset * 2;
    params.resolution[1] = host.offsetHeight + backlightOutset * 2;
  };
  readGeometry();

  const canvasSurface = surface(currentEngine.gpu, canvas, {
    alphaMode: "premultiplied",
    autoResize: false,
    clearColor: [0, 0, 0, 0],
    size: [1, 1],
    format: currentEngine.format,
    label: "loading backlight",
  });

  function stopLoop() {
    loop?.stop();
    loop = undefined;
  }

  function render(currentFrame: Frame) {
    canvasSurface.resize(
      backlightResolution(
        params.resolution[0],
        params.resolution[1],
        window.devicePixelRatio,
        currentEngine.gpu.gpu.limits.maxTextureDimension2D,
      ),
    );
    params.time = 0.42;
    if (!reducedMotion) {
      params.time = Math.max(0, (performance.now() - startedAt) / 1000);
    }

    // Each attachment submits its own frame, so shared shader bindings cannot
    // overwrite another canvas's uniforms before its commands are submitted.
    currentEngine.effect.set(uniforms);
    currentFrame.pass(canvasSurface, currentEngine.effect);
  }

  function fail(error: unknown) {
    if (failed || disposed) {
      return;
    }

    failed = true;
    stopLoop();
    reportBacklightError("backlight.draw", error);
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

    if (disposed || failed || !active || !visible || document.visibilityState !== "visible") {
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

  function resize() {
    if (disposed) {
      return;
    }
    readGeometry();
    synchronize();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host, { box: "border-box" });
  const visibilityObserver = new IntersectionObserver(
    ([entry]) => {
      visible = entry?.isIntersecting === true;
      synchronize();
    },
    { rootMargin: `${backlightOutset}px` },
  );
  visibilityObserver.observe(host);
  document.addEventListener("visibilitychange", synchronize);
  window.addEventListener("resize", resize, { passive: true });

  const attachment: BacklightAttachment = {
    setMode(mode) {
      if (active === mode.active && reducedMotion === mode.reducedMotion) {
        return;
      }

      if (!active && mode.active) {
        startedAt = performance.now();
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
      visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", synchronize);
      window.removeEventListener("resize", resize);
      canvasSurface.dispose();
      canvas.width = 1;
      canvas.height = 1;
      currentEngine.attachments.delete(attachment);
    },
  };
  currentEngine.attachments.add(attachment);
  return attachment;
}

function useBacklight(canvas: HTMLCanvasElement | null, mode: BacklightMode) {
  const attachment = useRef<BacklightAttachment>(undefined);
  const latestMode = useRef(mode);
  latestMode.current = mode;

  useEffect(() => {
    if (!canvas) {
      return;
    }

    if (!mode.active) {
      if (!attachment.current) {
        return;
      }

      // Retain the stopped attachment's last frame until its opacity fade ends.
      const timer = window.setTimeout(() => {
        attachment.current?.dispose();
        attachment.current = undefined;
      }, backlightFadeMs);
      return () => window.clearTimeout(timer);
    }

    if (attachment.current) {
      return;
    }

    const abort = new AbortController();

    void getEngine()
      .then((currentEngine) => {
        abort.signal.throwIfAborted();
        let nextAttachment: BacklightAttachment;

        try {
          nextAttachment = attachEngine(currentEngine, canvas);
        } catch (error) {
          reportBacklightError("backlight.attach", error);
          return;
        }

        attachment.current = nextAttachment;
        nextAttachment.setMode(latestMode.current);
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          reportBacklightError("backlight.initialize", error);
        }
      });

    return () => {
      abort.abort();
    };
  }, [canvas, mode.active]);

  useEffect(() => {
    return () => {
      attachment.current?.dispose();
      attachment.current = undefined;
    };
  }, [canvas]);

  useEffect(() => {
    attachment.current?.setMode(mode);
  }, [mode.active, mode.reducedMotion]);
}

/** Mount directly inside a positioned, isolated host; inherits its rounded shape. */
export function Backlight({ active }: { active: boolean }) {
  const reducedMotion = useReducedMotion();
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const mode = { active, reducedMotion };
  useBacklight(canvas, mode);

  return (
    <div aria-hidden="true" {...stylex.props(styles.container)}>
      <canvas
        ref={setCanvas}
        {...stylex.props(
          styles.canvas,
          active && styles.active,
          !reducedMotion && styles.transition,
        )}
      />
    </div>
  );
}

const styles = stylex.create({
  // Contain scroll overflow while allowing the glow to paint beyond the host.
  container: {
    borderRadius: "inherit",
    inset: 0,
    overflow: "clip",
    overflowClipMargin: `${backlightOutset}px`,
    pointerEvents: "none",
    position: "absolute",
    zIndex: 0,
  },
  canvas: {
    height: `calc(100% + ${backlightOutset * 2}px)`,
    left: -backlightOutset,
    opacity: 0,
    position: "absolute",
    top: -backlightOutset,
    width: `calc(100% + ${backlightOutset * 2}px)`,
  },
  active: {
    opacity: 1,
  },
  transition: {
    transitionDuration: `${backlightFadeMs}ms`,
    transitionProperty: "opacity",
    transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)",
  },
  paletteStart: {
    color: colors.effectBacklightGlowStart,
  },
  paletteFirstBlend: {
    color: colors.effectBacklightGlowMiddleStart,
  },
  paletteSecondBlend: {
    color: colors.effectBacklightGlowMiddleEnd,
  },
  paletteEnd: {
    color: colors.effectBacklightGlowEnd,
  },
});

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", disposeEngine);
  import.meta.hot?.dispose(() => {
    window.removeEventListener("pagehide", disposeEngine);
    disposeEngine();
  });
}
