import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  configureDevelopmentProfile,
  createDevelopmentProfileId,
  developmentProfileEnvironmentVariable,
  prepareApplicationInstance,
  requireDevelopmentProfileId,
} from "./development-profile";

const directories: string[] = [];

function createAppDataDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-development-profile-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("development profiles", () => {
  it("derives a stable, readable identity from the worktree path", () => {
    const worktree = join("projects", "Jaquélene Worktree");
    const profileId = createDevelopmentProfileId(worktree);

    expect(profileId).toMatch(/^jaquelene-worktree-[a-f0-9]{12}$/);
    expect(createDevelopmentProfileId(worktree)).toBe(profileId);
  });

  it("distinguishes worktrees with the same directory name", () => {
    const first = createDevelopmentProfileId(join("first-clone", "04"));
    const second = createDevelopmentProfileId(join("second-clone", "04"));

    expect(first).toMatch(/^04-[a-f0-9]{12}$/);
    expect(second).toMatch(/^04-[a-f0-9]{12}$/);
    expect(second).not.toBe(first);
  });

  it.each([undefined, "", "UPPERCASE", "../escape", "trailing-", "nul.txt", "a".repeat(65)])(
    "rejects an unsafe profile identity: %s",
    (profileId) => {
      expect(() => requireDevelopmentProfileId(profileId)).toThrow(
        developmentProfileEnvironmentVariable,
      );
    },
  );

  it("creates and assigns isolated Electron profile directories", () => {
    const appDataDirectory = createAppDataDirectory();
    const assignedPaths: Array<["userData" | "sessionData", string]> = [];
    const application = {
      isPackaged: false,
      getPath: (_name: "appData") => appDataDirectory,
      setPath: (name: "userData" | "sessionData", path: string) => {
        assignedPaths.push([name, path]);
      },
    };

    const profile = configureDevelopmentProfile(application, "04-123456789abc");

    if (!profile) {
      throw new Error("The development profile was not configured.");
    }

    expect(profile).toEqual({
      id: "04-123456789abc",
      userDataDirectory: join(appDataDirectory, "Jaquelene Development", "04-123456789abc"),
      sessionDataDirectory: join(
        appDataDirectory,
        "Jaquelene Development",
        "04-123456789abc",
        "session",
      ),
    });
    expect(assignedPaths).toEqual([
      ["userData", profile.userDataDirectory],
      ["sessionData", profile.sessionDataDirectory],
    ]);
    expect(existsSync(profile.userDataDirectory)).toBe(true);
    expect(existsSync(profile.sessionDataDirectory)).toBe(true);
  });

  it("assigns the profile before acquiring its single-instance lock", () => {
    const appDataDirectory = createAppDataDirectory();
    const events: string[] = [];
    const application = {
      isPackaged: false,
      getPath: (_name: "appData") => appDataDirectory,
      setPath: (name: "userData" | "sessionData") => {
        events.push(name);
      },
      requestSingleInstanceLock: () => {
        events.push("singleInstanceLock");
        return true;
      },
    };

    expect(prepareApplicationInstance(application, "04-123456789abc")).toMatchObject({
      hasSingleInstanceLock: true,
    });
    expect(events).toEqual(["userData", "sessionData", "singleInstanceLock"]);
  });

  it("does not alter packaged application paths", () => {
    const assignedPaths: string[] = [];
    let lockRequests = 0;
    const application = {
      isPackaged: true,
      getPath: (_name: "appData") => {
        throw new Error("Packaged applications must retain Electron's default paths.");
      },
      setPath: (_name: "userData" | "sessionData", path: string) => {
        assignedPaths.push(path);
      },
      requestSingleInstanceLock: () => {
        lockRequests += 1;
        return true;
      },
    };

    expect(prepareApplicationInstance(application, undefined)).toEqual({
      developmentProfile: undefined,
      hasSingleInstanceLock: true,
    });
    expect(assignedPaths).toEqual([]);
    expect(lockRequests).toBe(1);
  });
});
