import { describe, expect, it, vi } from "vite-plus/test";
import { createPathOpener } from "./path-opener";

describe("path opener", () => {
  it("opens a path through the operating system", async () => {
    const openElectronPath = vi.fn(async () => "");
    const openPath = createPathOpener(openElectronPath);

    await openPath("C:\\Jaquelene\\diagnostics");

    expect(openElectronPath).toHaveBeenCalledExactlyOnceWith("C:\\Jaquelene\\diagnostics");
  });

  it("normalizes an operating-system failure", async () => {
    const failure = "No application is associated with this path.";
    const openPath = createPathOpener(async () => failure);

    await expect(openPath("C:\\Jaquelene\\diagnostics")).rejects.toMatchObject({
      message: "The operating system could not open the requested path.",
      cause: failure,
    });
  });
});
