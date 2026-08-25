import { net, protocol } from "electron";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const scheme = "app";
const host = "bundle";

export const appUrl = `${scheme}://${host}/`;

export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme,
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
      },
    },
  ]);
}

export function handleAppScheme(webAppDirectory: string) {
  const root = resolve(webAppDirectory);

  protocol.handle(scheme, (request) => {
    const requestUrl = new URL(request.url);

    if (requestUrl.host !== host) {
      return new Response(null, { status: 404 });
    }

    let pathname: string;

    try {
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      return new Response(null, { status: 400 });
    }

    const resourcePath = resolve(
      root,
      pathname === "/" ? "index.html" : pathname.replace(/^[/\\]+/, ""),
    );
    const relativePath = relative(root, resourcePath);
    const escapesRoot =
      relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);

    if (!relativePath || escapesRoot) {
      return new Response(null, { status: 404 });
    }

    return net.fetch(pathToFileURL(resourcePath).toString());
  });
}
