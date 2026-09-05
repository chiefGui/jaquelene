import { useCallback, useState } from "react";
import {
  appendTextVersion,
  emptyTextVersions,
  nextTextVersion,
  previousTextVersion,
  type TextVersionChange,
} from "./text-versions";

export function useTextVersions({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const [versions, setVersions] = useState(emptyTextVersions);
  // A new editing segment begins when selecting a version or clearing the
  // session. Consumers can use this to reset their editor's typing history.
  const [revision, setRevision] = useState(0);

  const apply = useCallback(
    (change: TextVersionChange) => {
      if (change.versions === versions) {
        return;
      }
      setVersions(change.versions);
      setRevision((current) => current + 1);
      onValueChange(change.text);
    },
    [onValueChange, versions],
  );
  const append = useCallback(
    (text: string) => apply(appendTextVersion(versions, value, text)),
    [apply, value, versions],
  );
  const previous = useCallback(
    () => apply(previousTextVersion(versions, value)),
    [apply, value, versions],
  );
  const next = useCallback(() => apply(nextTextVersion(versions, value)), [apply, value, versions]);
  const reset = useCallback(() => {
    setVersions(emptyTextVersions());
    setRevision((current) => current + 1);
  }, []);

  return {
    append,
    count: versions.previous.length + versions.next.length + 1,
    index: versions.previous.length,
    next,
    previous,
    reset,
    revision,
  };
}
