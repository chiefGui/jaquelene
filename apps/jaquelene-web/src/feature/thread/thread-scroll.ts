const endThreshold = 32;

export type ThreadTimelineScrollSnapshot = Readonly<{
  bottomInset: number;
  latestMessageId: string | null;
  oldestSequence: number | null;
  newestSequence: number | null;
  replyPending: boolean;
  scrollRequest: number;
}>;

export function threadScrollDestination(
  previous: ThreadTimelineScrollSnapshot | null,
  current: ThreadTimelineScrollSnapshot,
  latestHistory: boolean,
  following: boolean,
): "start" | "end" | null {
  if (previous === null || current.scrollRequest !== previous.scrollRequest) {
    return "end";
  }

  if (
    current.newestSequence !== null &&
    previous.oldestSequence !== null &&
    current.newestSequence < previous.oldestSequence
  ) {
    return "end";
  }

  if (
    current.oldestSequence !== null &&
    previous.newestSequence !== null &&
    current.oldestSequence > previous.newestSequence
  ) {
    if (latestHistory) {
      return "end";
    }

    return "start";
  }

  const timelineChanged =
    current.latestMessageId !== previous.latestMessageId ||
    current.replyPending !== previous.replyPending ||
    current.bottomInset !== previous.bottomInset;

  if (latestHistory && following && timelineChanged) {
    return "end";
  }

  return null;
}

export function shouldFollowThreadEnd(
  following: boolean,
  previousOffset: number,
  offset: number,
  distanceFromEnd: number,
): boolean {
  if (distanceFromEnd <= endThreshold) {
    return true;
  }

  if (offset < previousOffset) {
    return false;
  }

  return following;
}
