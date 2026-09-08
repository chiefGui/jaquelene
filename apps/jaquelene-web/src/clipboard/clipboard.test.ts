import { describe, expect, it, vi } from "vite-plus/test";
import { ClipboardWriteError, createClipboard } from "./clipboard";

describe("clipboard writing", () => {
  it("starts immediately, preserves whitespace, and completes only after the platform write", async () => {
    let complete!: () => void;
    const platformWrite = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const writeText = vi.fn(() => platformWrite);
    const clipboard = createClipboard(() => ({ writeText }));
    const text = "  First line\n\tSecond line\n";
    let finished = false;
    const writing = clipboard.writeText(text).then(() => {
      finished = true;
    });

    expect(writeText).toHaveBeenCalledWith(text);
    await Promise.resolve();
    expect(finished).toBe(false);
    complete();
    await writing;
    expect(finished).toBe(true);
  });

  it("reports denied writes without retrying and allows an explicit retry", async () => {
    const cause = new DOMException("Not allowed", "NotAllowedError");
    const writeText = vi.fn().mockRejectedValueOnce(cause).mockResolvedValue(undefined);
    const clipboard = createClipboard(() => ({ writeText }));

    await expect(clipboard.writeText("selection")).rejects.toMatchObject({
      name: "ClipboardWriteError",
      cause,
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    await expect(clipboard.writeText("selection")).resolves.toBeUndefined();
  });

  it("reports an unavailable clipboard as a recoverable write failure", async () => {
    const clipboard = createClipboard(() => undefined);
    await expect(clipboard.writeText("selection")).rejects.toBeInstanceOf(ClipboardWriteError);
  });

  it("keeps the native method receiver and converts synchronous failures", async () => {
    const cause = new Error("Platform failure");
    const writer = {
      writeText() {
        expect(this).toBe(writer);
        throw cause;
      },
    };
    const clipboard = createClipboard(() => writer);
    await expect(clipboard.writeText("selection")).rejects.toMatchObject({ cause });
  });
});
