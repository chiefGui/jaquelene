import { describe, expect, it } from "vite-plus/test";
import {
  shouldFollowThreadEnd,
  threadScrollDestination,
  type ThreadTimelineScrollSnapshot,
} from "./thread-scroll";

function snapshot(
  sequences: number[],
  overrides: Partial<ThreadTimelineScrollSnapshot> = {},
): ThreadTimelineScrollSnapshot {
  return {
    bottomInset: 160,
    latestMessageId: sequences.at(-1)?.toString() ?? null,
    oldestSequence: sequences[0] ?? null,
    newestSequence: sequences.at(-1) ?? null,
    replyPending: false,
    scrollRequest: 0,
    ...overrides,
  };
}

describe("thread scroll destination", () => {
  it("opens an existing conversation at the end once layout is ready", () => {
    expect(threadScrollDestination(null, snapshot([1, 2, 3]), true, false)).toBe("end");
  });

  it("reveals a send from the top before a pending message is rendered", () => {
    const previous = snapshot([1, 2, 3]);
    const sending = snapshot([1, 2, 3], { scrollRequest: 1 });
    expect(threadScrollDestination(previous, sending, true, false)).toBe("end");
  });

  it("reveals a fast send that is already persisted by the next update", () => {
    const previous = snapshot([1, 2, 3]);
    const submitted = snapshot([1, 2, 3, 4], { scrollRequest: 1 });
    expect(threadScrollDestination(previous, submitted, true, false)).toBe("end");
  });

  it("does not repeat an old send request after the reader scrolls away", () => {
    const submitted = snapshot([1, 2, 3, 4], { scrollRequest: 1, replyPending: true });
    const reply = snapshot([1, 2, 3, 4, 5], { scrollRequest: 1 });
    expect(threadScrollDestination(submitted, reply, true, false)).toBeNull();
    expect(threadScrollDestination(submitted, reply, true, true)).toBe("end");
  });

  it("follows composer height changes only while following the end", () => {
    const previous = snapshot([1, 2, 3]);
    const resized = snapshot([1, 2, 3], { bottomInset: 300 });
    expect(threadScrollDestination(previous, resized, true, true)).toBe("end");
    expect(threadScrollDestination(previous, resized, true, false)).toBeNull();
  });

  it("reveals a reply failure without requiring a new message", () => {
    const pending = snapshot([1, 2, 3], { replyPending: true });
    expect(threadScrollDestination(pending, snapshot([1, 2, 3]), true, true)).toBe("end");
  });

  it("preserves the visible message when older history is prepended", () => {
    expect(
      threadScrollDestination(snapshot([3, 4, 5]), snapshot([1, 2, 3, 4, 5]), true, false),
    ).toBeNull();
  });

  it("keeps reading position when page replacement retains a boundary message", () => {
    const previous = snapshot([2, 3, 4]);
    expect(threadScrollDestination(previous, snapshot([4, 5, 6]), false, true)).toBeNull();
    expect(threadScrollDestination(previous, snapshot([1, 2]), false, true)).toBeNull();
  });

  it("enters a disjoint older window at its newest messages", () => {
    expect(threadScrollDestination(snapshot([4, 5, 6]), snapshot([1, 2, 3]), false, false)).toBe(
      "end",
    );
  });

  it("enters newer history at the start until reaching the latest window", () => {
    const older = snapshot([1, 2, 3]);
    const newer = snapshot([4, 5, 6]);
    expect(threadScrollDestination(older, newer, false, true)).toBe("start");
    expect(threadScrollDestination(older, newer, true, false)).toBe("end");
  });
});

describe("following the thread end", () => {
  it("keeps following when new content grows beyond the viewport", () => {
    expect(shouldFollowThreadEnd(true, 400, 400, 600)).toBe(true);
    expect(shouldFollowThreadEnd(true, 400, 700, 300)).toBe(true);
  });

  it("stops following when the reader scrolls up", () => {
    expect(shouldFollowThreadEnd(true, 400, 300, 100)).toBe(false);
  });

  it("preserves reading position while browsing away from the end", () => {
    expect(shouldFollowThreadEnd(false, 300, 300, 700)).toBe(false);
    expect(shouldFollowThreadEnd(false, 300, 400, 600)).toBe(false);
  });

  it("resumes following near the end, allowing small layout differences", () => {
    expect(shouldFollowThreadEnd(false, 300, 980, 20)).toBe(true);
    expect(shouldFollowThreadEnd(true, 1000, 999.5, 0.5)).toBe(true);
  });

  it("follows content that fits without scrolling", () => {
    expect(shouldFollowThreadEnd(false, 400, 0, 0)).toBe(true);
  });
});
