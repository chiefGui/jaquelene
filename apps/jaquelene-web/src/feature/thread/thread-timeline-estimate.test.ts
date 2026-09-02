import { describe, expect, it } from "vite-plus/test";
import { estimateThreadTimelineItemSize } from "./thread-timeline-estimate";

describe("thread timeline size estimation", () => {
  it("accounts for wrapped source lines", () => {
    expect(estimateThreadTimelineItemSize("a".repeat(32), false)).toBe(74);
    expect(estimateThreadTimelineItemSize("a".repeat(33), false)).toBe(94);
  });

  it("accounts for explicit lines and paragraph gaps", () => {
    expect(estimateThreadTimelineItemSize("one\ntwo", false)).toBe(94);
    expect(estimateThreadTimelineItemSize("one\n\ntwo", false)).toBe(104);
    expect(estimateThreadTimelineItemSize("one\r\ntwo", false)).toBe(94);
  });

  it("collapses blank-line runs and ignores surrounding blank lines", () => {
    expect(estimateThreadTimelineItemSize("one\n\n\n\ntwo", false)).toBe(104);
    expect(estimateThreadTimelineItemSize("\n\n one \n\n", false)).toBe(74);
    expect(estimateThreadTimelineItemSize("\n\n", false)).toBe(74);
  });

  it("includes adjacent reply activity", () => {
    expect(estimateThreadTimelineItemSize("one", true)).toBe(96);
  });
});
