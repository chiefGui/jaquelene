import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const electron = vi.hoisted(() => ({
  fetch: vi.fn(),
  handle: vi.fn(),
  registerSchemesAsPrivileged: vi.fn(),
}));

vi.mock("electron", () => ({
  net: { fetch: electron.fetch },
  protocol: {
    handle: electron.handle,
    registerSchemesAsPrivileged: electron.registerSchemesAsPrivileged,
  },
}));

import { appUrl, handleAppScheme, registerAppScheme } from "./app-protocol";

type AppProtocolHandler = (request: { url: string }) => Response | Promise<Response>;

function registeredHandler() {
  const handler = electron.handle.mock.calls.at(-1)?.[1] as AppProtocolHandler | undefined;

  if (!handler) {
    throw new Error("The app protocol handler was not registered.");
  }

  return handler;
}

beforeEach(() => {
  vi.clearAllMocks();
  electron.fetch.mockResolvedValue(new Response());
});

describe("app protocol", () => {
  it("registers the application origin as secure and standard", () => {
    registerAppScheme();

    expect(electron.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      {
        scheme: "app",
        privileges: {
          secure: true,
          standard: true,
          supportFetchAPI: true,
        },
      },
    ]);
  });

  it("serves the web app entry point and its assets", async () => {
    const root = resolve("web-dist");
    handleAppScheme(root);
    const handle = registeredHandler();

    await handle({ url: appUrl });
    await handle({ url: `${appUrl}assets/app.js` });

    expect(electron.fetch).toHaveBeenNthCalledWith(
      1,
      pathToFileURL(join(root, "index.html")).toString(),
    );
    expect(electron.fetch).toHaveBeenNthCalledWith(
      2,
      pathToFileURL(join(root, "assets/app.js")).toString(),
    );
  });

  it.each([
    ["another host", "app://elsewhere/index.html", 404],
    ["a path outside the web app", `${appUrl}assets%2F..%2F..%2Fsecret`, 404],
    ["a malformed path", `${appUrl}%`, 400],
  ])("rejects %s", async (_name, url, status) => {
    handleAppScheme(resolve("web-dist"));

    const response = await registeredHandler()({ url });

    expect(response.status).toBe(status);
    expect(electron.fetch).not.toHaveBeenCalled();
  });
});
