import { describe, expect, it } from "vite-plus/test";
import { estimateThreadTimelineItemSize } from "./thread-timeline-estimate";

describe("thread timeline size estimation", () => {
  it("accounts for wrapped source lines", () => {
    expect(estimateThreadTimelineItemSize("a".repeat(32), false)).toBe(62);
    expect(estimateThreadTimelineItemSize("a".repeat(33), false)).toBe(82);
  });

  it("accounts for explicit lines and paragraph gaps", () => {
    expect(estimateThreadTimelineItemSize("one\ntwo", false)).toBe(82);
    expect(estimateThreadTimelineItemSize("one\n\ntwo", false)).toBe(92);
    expect(estimateThreadTimelineItemSize("one\r\ntwo", false)).toBe(82);
  });

  it("collapses blank-line runs and ignores surrounding blank lines", () => {
    expect(estimateThreadTimelineItemSize("one\n\n\n\ntwo", false)).toBe(92);
    expect(estimateThreadTimelineItemSize("\n\n one \n\n", false)).toBe(62);
    expect(estimateThreadTimelineItemSize("\n\n", false)).toBe(62);
  });

  it("includes adjacent reply activity", () => {
    expect(estimateThreadTimelineItemSize("one", true)).toBe(84);
  });
});
