import { describe, expect, it } from "vite-plus/test";
import { backlightResolution } from "./backlight-resolution";

describe("backlight resolution", () => {
  it("keeps ordinary surfaces sharp up to double density", () => {
    expect(backlightResolution(640, 240, 1, 8192)).toEqual([640, 240]);
    expect(backlightResolution(640, 240, 1.5, 8192)).toEqual([960, 360]);
    expect(backlightResolution(640, 240, 3, 8192)).toEqual([1280, 480]);
  });

  it("bounds very long responses by the device texture limit", () => {
    const [width, height] = backlightResolution(800, 100_000, 2, 8192);
    expect(height).toBeLessThanOrEqual(8192);
    expect(width).toBeGreaterThanOrEqual(800);
    expect(width * height).toBeLessThanOrEqual(2048 * 2048);
  });

  it("bounds total pixels even when both dimensions fit the device", () => {
    expect(backlightResolution(4000, 4000, 2, 8192)).toEqual([2048, 2048]);
  });

  it("keeps tiny and extreme aspect ratios renderable", () => {
    expect(backlightResolution(1, 1_000_000, 2, 4096)).toEqual([2, 4096]);
    expect(backlightResolution(1_000_000, 1, 2, 4096)).toEqual([4096, 2]);
    expect(backlightResolution(0, 0, 1, 8192)).toEqual([1, 1]);
  });
});
