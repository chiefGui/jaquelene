import { describe, expect, it } from "vite-plus/test";
import {
  appendTextVersion,
  emptyTextVersions,
  nextTextVersion,
  previousTextVersion,
} from "./text-versions";

describe("text versions", () => {
  it("browses complete versions in both directions", () => {
    const first = appendTextVersion(emptyTextVersions(), "Original", "First");
    const second = appendTextVersion(first.versions, first.text, "Second");
    const back = previousTextVersion(second.versions, second.text);
    expect(back.text).toBe("First");
    expect(previousTextVersion(back.versions, back.text).text).toBe("Original");
    expect(nextTextVersion(back.versions, back.text)).toEqual(second);
  });

  it("retains manual edits to the version being left", () => {
    const first = appendTextVersion(emptyTextVersions(), "Edited original", "First");
    const back = previousTextVersion(first.versions, "Edited first");
    expect(back.text).toBe("Edited original");
    expect(nextTextVersion(back.versions, "Revised original").text).toBe("Edited first");
    expect(nextTextVersion(back.versions, "Revised original").versions.previous).toEqual([
      "Revised original",
    ]);
  });

  it("keeps newer alternatives when creating from an older version", () => {
    const first = appendTextVersion(emptyTextVersions(), "Original", "First");
    const second = appendTextVersion(first.versions, first.text, "Second");
    const back = previousTextVersion(second.versions, second.text);
    const third = appendTextVersion(back.versions, "Edited first", "Third");
    expect(third).toEqual({
      versions: { previous: ["Original", "Edited first", "Second"], next: [] },
      text: "Third",
    });
  });

  it("doesn't create another version for an unchanged result", () => {
    const versions = emptyTextVersions();
    expect(appendTextVersion(versions, "Same", "Same").versions).toBe(versions);
  });

  it("doesn't move past either boundary", () => {
    const versions = emptyTextVersions();
    expect(previousTextVersion(versions, "Current")).toEqual({ versions, text: "Current" });
    expect(nextTextVersion(versions, "Current")).toEqual({ versions, text: "Current" });
  });

  it("retains an empty original as a valid version", () => {
    const result = appendTextVersion(emptyTextVersions(), "", "New text");
    expect(previousTextVersion(result.versions, result.text).text).toBe("");
  });

  it("starts a new session without retaining prior alternatives", () => {
    const first = appendTextVersion(emptyTextVersions(), "Original", "First");
    const reset = emptyTextVersions();
    expect(previousTextVersion(reset, first.text).text).toBe("First");
    expect(appendTextVersion(reset, first.text, "Next").versions.previous).toEqual(["First"]);
  });
});
