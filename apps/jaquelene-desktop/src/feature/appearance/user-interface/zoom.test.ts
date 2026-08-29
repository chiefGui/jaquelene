import { describe, expect, it, vi } from "vite-plus/test";
import { InterfaceScale } from "./preferences";
import { applyInterfaceScale, createInterfaceScaleWebPreferences } from "./zoom";

const scaleFactors = [
  [InterfaceScale.Percent90, 0.9],
  [InterfaceScale.Percent100, 1],
  [InterfaceScale.Percent110, 1.1],
  [InterfaceScale.Percent125, 1.25],
] as const;

describe("interface scale zoom", () => {
  it.each(scaleFactors)("creates isolated launch preferences for %s%%", (scale, zoomFactor) => {
    expect(createInterfaceScaleWebPreferences(scale)).toEqual({
      zoomFactor,
      zoomMode: "isolated",
    });
  });

  it("applies a scale change to the current web contents", () => {
    const setZoomFactor = vi.fn();

    applyInterfaceScale({ setZoomFactor }, InterfaceScale.Percent125);

    expect(setZoomFactor).toHaveBeenCalledOnce();
    expect(setZoomFactor).toHaveBeenCalledWith(1.25);
  });
});
