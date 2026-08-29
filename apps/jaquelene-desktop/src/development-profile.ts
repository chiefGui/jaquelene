import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { basename, join, normalize, resolve } from "node:path";

export const developmentProfileEnvironmentVariable = "JAQUELENE_DEVELOPMENT_PROFILE";

const developmentProfilesDirectoryName = "Jaquelene Development";
const fingerprintLength = 12;
const maximumProfileIdLength = 64;
const maximumProfileLabelLength = maximumProfileIdLength - fingerprintLength - 1;
const profileIdPattern = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const windowsDeviceNamePattern = /^(?:aux|com[1-9]|con|lpt[1-9]|nul|prn)(?:\.|$)/;

interface ProfileApplication {
  readonly isPackaged: boolean;
  getPath(name: "appData"): string;
  setPath(name: "userData" | "sessionData", path: string): void;
}

interface ProfileInstanceApplication extends ProfileApplication {
  requestSingleInstanceLock(): boolean;
}

function comparablePath(path: string) {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function profileLabel(worktreeDirectory: string) {
  const normalized = basename(worktreeDirectory)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, maximumProfileLabelLength)
    .replace(/[._-]+$/g, "");

  return normalized || "worktree";
}

export function requireDevelopmentProfileId(value: string | undefined) {
  if (
    value === undefined ||
    value.length > maximumProfileIdLength ||
    !profileIdPattern.test(value) ||
    windowsDeviceNamePattern.test(value)
  ) {
    throw new TypeError(
      `${developmentProfileEnvironmentVariable} must be a safe 1-${maximumProfileIdLength} character identifier using lowercase letters, numbers, dots, underscores, or hyphens; it must start and end with a letter or number and cannot be a reserved device name.`,
    );
  }

  return value;
}

export function createDevelopmentProfileId(worktreeDirectory: string) {
  const normalizedDirectory = normalize(resolve(worktreeDirectory));
  const fingerprint = createHash("sha256")
    .update(comparablePath(normalizedDirectory))
    .digest("hex")
    .slice(0, fingerprintLength);

  return requireDevelopmentProfileId(`${profileLabel(normalizedDirectory)}-${fingerprint}`);
}

export function configureDevelopmentProfile(
  application: ProfileApplication,
  profileId: string | undefined,
) {
  if (application.isPackaged) {
    return undefined;
  }

  const id = requireDevelopmentProfileId(profileId);
  const userDataDirectory = join(
    application.getPath("appData"),
    developmentProfilesDirectoryName,
    id,
  );
  const sessionDataDirectory = join(userDataDirectory, "session");

  mkdirSync(sessionDataDirectory, { recursive: true });
  application.setPath("userData", userDataDirectory);
  application.setPath("sessionData", sessionDataDirectory);

  return { id, userDataDirectory, sessionDataDirectory } as const;
}

export function prepareApplicationInstance(
  application: ProfileInstanceApplication,
  profileId: string | undefined,
) {
  const developmentProfile = configureDevelopmentProfile(application, profileId);
  const hasSingleInstanceLock = application.requestSingleInstanceLock();

  return { developmentProfile, hasSingleInstanceLock } as const;
}
