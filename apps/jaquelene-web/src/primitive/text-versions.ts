// The editor owns the current text. Only inactive versions are retained here,
// so typing doesn't copy the history or create a second source of truth.
export type TextVersions = Readonly<{
  previous: readonly string[];
  next: readonly string[];
}>;

export type TextVersionChange = Readonly<{
  versions: TextVersions;
  text: string;
}>;

export function emptyTextVersions(): TextVersions {
  return { previous: [], next: [] };
}

export function appendTextVersion(
  versions: TextVersions,
  current: string,
  text: string,
): TextVersionChange {
  if (text === current) {
    return { versions, text };
  }

  // Versions are alternatives, not undo events. Creating from an older
  // version must not discard the newer alternatives.
  return {
    versions: { previous: [...versions.previous, current, ...versions.next], next: [] },
    text,
  };
}

export function previousTextVersion(versions: TextVersions, current: string): TextVersionChange {
  const text = versions.previous.at(-1);
  if (text === undefined) {
    return { versions, text: current };
  }
  return {
    versions: {
      previous: versions.previous.slice(0, -1),
      next: [current, ...versions.next],
    },
    text,
  };
}

export function nextTextVersion(versions: TextVersions, current: string): TextVersionChange {
  const text = versions.next[0];
  if (text === undefined) {
    return { versions, text: current };
  }
  return {
    versions: {
      previous: [...versions.previous, current],
      next: versions.next.slice(1),
    },
    text,
  };
}
