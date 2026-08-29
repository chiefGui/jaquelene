export type PathOpener = (path: string) => Promise<void>;

type ElectronPathOpener = (path: string) => Promise<string>;

export function createPathOpener(openElectronPath: ElectronPathOpener): PathOpener {
  return async (path) => {
    const failure = await openElectronPath(path);

    if (failure) {
      throw new Error("The operating system could not open the requested path.", {
        cause: failure,
      });
    }
  };
}
