export type ClipboardWriter = Readonly<{
  writeText: (text: string) => Promise<void>;
}>;

export class ClipboardWriteError extends Error {
  constructor(cause?: unknown) {
    super("Couldn't copy to clipboard. Try again.", { cause });
    this.name = "ClipboardWriteError";
  }
}

export function createClipboard(getWriter: () => ClipboardWriter | undefined): ClipboardWriter {
  return {
    async writeText(text) {
      try {
        const writer = getWriter();
        if (!writer) {
          throw new Error("Clipboard writing is unavailable.");
        }
        // Start the write in the user action, before yielding user activation.
        await writer.writeText(text);
      } catch (cause) {
        throw new ClipboardWriteError(cause);
      }
    },
  };
}

export const clipboard = createClipboard(() => globalThis.navigator?.clipboard);
