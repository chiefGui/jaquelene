import { describe, expect, it } from "vite-plus/test";
import { estimateThreadTimelineItemSize } from "./thread-timeline-estimate";

describe("thread timeline size estimation", () => {
  it("adds the same height for wrapped and explicit lines", () => {
    const singleLine = estimateThreadTimelineItemSize("a".repeat(32), false);
    const wrappedLine = estimateThreadTimelineItemSize("a".repeat(33), false);
    const explicitSingleLine = estimateThreadTimelineItemSize("one", false);
    const explicitSecondLine = estimateThreadTimelineItemSize("one\ntwo", false);

    expect(wrappedLine).toBeGreaterThan(singleLine);
    expect(wrappedLine - singleLine).toBe(explicitSecondLine - explicitSingleLine);
  });

  it("treats paragraph gaps separately from line endings", () => {
    const lineFeed = estimateThreadTimelineItemSize("one\ntwo", false);
    const carriageReturnLineFeed = estimateThreadTimelineItemSize("one\r\ntwo", false);
    const paragraphGap = estimateThreadTimelineItemSize("one\n\ntwo", false);

    expect(carriageReturnLineFeed).toBe(lineFeed);
    expect(paragraphGap).toBeGreaterThan(lineFeed);
  });

  it("collapses blank-line runs and ignores surrounding blank lines", () => {
    expect(estimateThreadTimelineItemSize("one\n\n\n\ntwo", false)).toBe(
      estimateThreadTimelineItemSize("one\n\ntwo", false),
    );
    expect(estimateThreadTimelineItemSize("\n\n one \n\n", false)).toBe(
      estimateThreadTimelineItemSize("one", false),
    );
    expect(estimateThreadTimelineItemSize("\n\n", false)).toBe(
      estimateThreadTimelineItemSize("", false),
    );
  });

  it("adds a content-independent increment for reply failure state", () => {
    const shortIncrement =
      estimateThreadTimelineItemSize("one", true) - estimateThreadTimelineItemSize("one", false);
    const longIncrement =
      estimateThreadTimelineItemSize("a".repeat(64), true) -
      estimateThreadTimelineItemSize("a".repeat(64), false);

    expect(shortIncrement).toBeGreaterThan(0);
    expect(longIncrement).toBe(shortIncrement);
  });
});
