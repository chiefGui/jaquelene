import { extractFile, listPackage } from "@electron/asar";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import packageManifest from "../package.json" with { type: "json" };
import { productVersion } from "./product-version";

const architecture = "x64";
const applicationName = packageManifest.productName;
const applicationPublisher = packageManifest.author;
const desktopDirectory = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(desktopDirectory, "../..", "release/jaquelene-desktop");
const unpackedDirectory = resolve(outputDirectory, "win-unpacked");
const artifactBaseName = `${applicationName}-${productVersion}-windows-${architecture}-setup.exe`;
const installerPath = resolve(outputDirectory, artifactBaseName);
const blockMapPath = `${installerPath}.blockmap`;
const updateMetadataPath = resolve(outputDirectory, "latest.yml");
const executablePath = resolve(unpackedDirectory, `${applicationName}.exe`);
const asarPath = resolve(unpackedDirectory, "resources/app.asar");
const webIndexPath = resolve(unpackedDirectory, "resources/web/index.html");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertFile(path: string) {
  const file = await stat(path);
  assert(file.isFile(), `Expected a file at ${path}`);
  assert(file.size > 0, `Expected a non-empty file at ${path}`);
  return file;
}

async function calculateSha512(path: string) {
  const hash = createHash("sha512");
  await pipeline(createReadStream(path), hash);
  return hash.digest("base64");
}

async function readPortableExecutable(path: string) {
  const file = await open(path, "r");

  try {
    const dosHeader = Buffer.alloc(64);
    const dosRead = await file.read(dosHeader, 0, dosHeader.length, 0);
    assert(dosRead.bytesRead === dosHeader.length, `Could not read the DOS header from ${path}`);
    assert(dosHeader.readUInt16LE(0) === 0x5a4d, `Expected an MZ executable at ${path}`);

    const portableExecutableOffset = dosHeader.readUInt32LE(0x3c);
    const portableExecutableHeader = Buffer.alloc(24);
    const headerRead = await file.read(
      portableExecutableHeader,
      0,
      portableExecutableHeader.length,
      portableExecutableOffset,
    );
    assert(
      headerRead.bytesRead === portableExecutableHeader.length,
      `Could not read the PE header from ${path}`,
    );
    assert(
      portableExecutableHeader.readUInt32LE(0) === 0x00004550,
      `Expected a PE executable at ${path}`,
    );

    const optionalHeaderSize = portableExecutableHeader.readUInt16LE(20);
    const optionalHeader = Buffer.alloc(optionalHeaderSize);
    const optionalHeaderRead = await file.read(
      optionalHeader,
      0,
      optionalHeader.length,
      portableExecutableOffset + portableExecutableHeader.length,
    );
    assert(
      optionalHeaderRead.bytesRead === optionalHeader.length,
      `Could not read the PE optional header from ${path}`,
    );

    const optionalHeaderMagic = optionalHeader.readUInt16LE(0);
    const dataDirectoriesOffset =
      optionalHeaderMagic === 0x20b ? 112 : optionalHeaderMagic === 0x10b ? 96 : undefined;
    assert(dataDirectoriesOffset !== undefined, `Unsupported PE optional header in ${path}`);

    const certificateDirectoryOffset = dataDirectoriesOffset + 4 * 8;
    assert(
      optionalHeader.length >= certificateDirectoryOffset + 8,
      `The PE optional header is incomplete in ${path}`,
    );
    assert(
      optionalHeader.readUInt32LE(dataDirectoriesOffset - 4) >= 5,
      `The PE certificate directory is missing from ${path}`,
    );

    const certificateTableOffset = optionalHeader.readUInt32LE(certificateDirectoryOffset);
    const certificateTableSize = optionalHeader.readUInt32LE(certificateDirectoryOffset + 4);
    assert(
      (certificateTableOffset === 0) === (certificateTableSize === 0),
      `The PE certificate directory is incomplete in ${path}`,
    );
    if (certificateTableSize > 0) {
      const fileInformation = await file.stat();
      assert(
        certificateTableOffset + certificateTableSize <= fileInformation.size,
        `The PE certificate table is outside ${path}`,
      );
    }

    return {
      machine: portableExecutableHeader.readUInt16LE(4),
      hasAuthenticodeCertificate: certificateTableSize > 0,
    };
  } finally {
    await file.close();
  }
}

function readWindowsExecutableMetadata(path: string) {
  assert(process.platform === "win32", "Windows package verification must run on Windows.");

  const command = [
    "$info = [Diagnostics.FileVersionInfo]::GetVersionInfo($env:JAQUELENE_VERIFY_EXECUTABLE)",
    "[PSCustomObject]@{ FileDescription = $info.FileDescription; ProductName = $info.ProductName; CompanyName = $info.CompanyName; FileVersion = $info.FileVersion } | ConvertTo-Json -Compress",
  ].join("; ");
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        JAQUELENE_VERIFY_EXECUTABLE: path,
      },
    },
  );

  assert(result.status === 0, result.stderr || "Could not inspect the packaged executable.");
  return JSON.parse(result.stdout) as {
    FileDescription: string;
    ProductName: string;
    CompanyName: string;
    FileVersion: string;
  };
}

function readAuthenticodeSignatureStatus(path: string) {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "$signature = Get-AuthenticodeSignature -LiteralPath $env:JAQUELENE_VERIFY_EXECUTABLE",
    "if ($null -eq $signature) { throw 'Windows returned no Authenticode signature result.' }",
    "$signature.Status.ToString()",
  ].join("; ");
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        JAQUELENE_VERIFY_EXECUTABLE: path,
      },
    },
  );

  assert(result.status === 0, result.stderr || `Could not verify the signature of ${path}.`);
  const signatureStatus = result.stdout.trim();
  assert(signatureStatus.length > 0, `Windows returned no signature status for ${path}.`);
  return signatureStatus;
}

const [installer, blockMap] = await Promise.all([
  assertFile(installerPath),
  assertFile(blockMapPath),
  assertFile(updateMetadataPath),
  assertFile(executablePath),
  assertFile(asarPath),
  assertFile(webIndexPath),
]);

const [updateMetadata, installerSha512] = await Promise.all([
  readFile(updateMetadataPath, "utf8"),
  calculateSha512(installerPath),
]);
for (const expectedMetadata of [
  `version: ${productVersion}`,
  `url: ${artifactBaseName}`,
  `path: ${artifactBaseName}`,
  `size: ${String(installer.size)}`,
]) {
  assert(
    updateMetadata.includes(expectedMetadata),
    `Update metadata is missing ${expectedMetadata}.`,
  );
}
const updateMetadataChecksums = Array.from(
  updateMetadata.matchAll(/^[ \t]*sha512:[ \t]*(\S+)[ \t]*\r?$/gm),
  (match) => match[1],
);
assert(
  updateMetadataChecksums.length === 2,
  `Update metadata contains ${String(updateMetadataChecksums.length)} SHA-512 checksums instead of 2.`,
);
assert(
  updateMetadataChecksums.every((checksum) => checksum === installerSha512),
  "Update metadata SHA-512 does not match the installer.",
);

const [installerExecutable, applicationExecutable] = await Promise.all([
  readPortableExecutable(installerPath),
  readPortableExecutable(executablePath),
]);
assert(applicationExecutable.machine === 0x8664, "The packaged executable is not Windows x64.");

const installerMetadata = readWindowsExecutableMetadata(installerPath);
const executableMetadata = readWindowsExecutableMetadata(executablePath);
const installerSignatureStatus = installerExecutable.hasAuthenticodeCertificate
  ? readAuthenticodeSignatureStatus(installerPath)
  : "NotSigned";
const executableSignatureStatus = applicationExecutable.hasAuthenticodeCertificate
  ? readAuthenticodeSignatureStatus(executablePath)
  : "NotSigned";
assert(
  installerMetadata.FileDescription === packageManifest.description,
  `Unexpected installer description: ${installerMetadata.FileDescription}`,
);
assert(
  executableMetadata.FileDescription === applicationName,
  `Unexpected file description: ${executableMetadata.FileDescription}`,
);
for (const [label, metadata] of [
  ["Installer", installerMetadata],
  ["Executable", executableMetadata],
] as const) {
  assert(
    metadata.ProductName === applicationName,
    `${label} has an unexpected product name: ${metadata.ProductName}`,
  );
  assert(
    metadata.CompanyName === applicationPublisher,
    `${label} has an unexpected company name: ${metadata.CompanyName}`,
  );
  assert(
    metadata.FileVersion === productVersion,
    `${label} version ${metadata.FileVersion} does not match ${productVersion}.`,
  );
}
assert(
  installerSignatureStatus === executableSignatureStatus,
  "The installer and executable have different signature states.",
);
assert(
  installerSignatureStatus === "NotSigned" || installerSignatureStatus === "Valid",
  `The package has an invalid signature state: ${installerSignatureStatus}`,
);

const packagedManifest = JSON.parse(extractFile(asarPath, "package.json").toString("utf8")) as {
  name?: string;
  productName?: string;
  version?: string;
  main?: string;
  dependencies?: Record<string, string>;
};
assert(
  packagedManifest.name === packageManifest.name,
  "The packaged application name is incorrect.",
);
assert(packagedManifest.productName === applicationName, "The packaged product name is incorrect.");
assert(
  packagedManifest.version === productVersion,
  "The packaged application version is incorrect.",
);
assert(packagedManifest.main === packageManifest.main, "The packaged main entry is incorrect.");
assert(
  JSON.stringify(Object.keys(packagedManifest.dependencies ?? {}).sort()) ===
    JSON.stringify(["electron-store"]),
  "The packaged runtime dependency set is not minimal.",
);

const asarEntries = listPackage(asarPath, { isPack: false }).map((entry) =>
  entry.replaceAll("\\", "/"),
);
for (const requiredEntry of [
  "/dist-electron/main/main.js",
  "/dist-electron/preload/preload.cjs",
  "/node_modules/electron-store/package.json",
]) {
  assert(asarEntries.includes(requiredEntry), `The package is missing ${requiredEntry}.`);
}
assert(
  asarEntries.some(
    (entry) => entry.startsWith("/dist-electron/migrations/") && entry.endsWith("/migration.sql"),
  ),
  "The package contains no database migrations.",
);
for (const forbiddenEntry of [
  "/node_modules/@jaquelene",
  "/node_modules/@openrouter",
  "/node_modules/drizzle-orm",
  "/node_modules/effect",
  "/node_modules/typeid-js",
]) {
  assert(
    !asarEntries.some(
      (entry) => entry === forbiddenEntry || entry.startsWith(`${forbiddenEntry}/`),
    ),
    `The package duplicates bundled code under ${forbiddenEntry}.`,
  );
}

const localeFiles = (
  await readdir(resolve(unpackedDirectory, "locales"), {
    withFileTypes: true,
  })
)
  .filter((entry) => entry.isFile() && entry.name.endsWith(".pak"))
  .map((entry) => entry.name)
  .sort();
assert(
  JSON.stringify(localeFiles) === JSON.stringify(["en-US.pak"]),
  `Unexpected Electron locales: ${localeFiles.join(", ")}`,
);

const mebibytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
console.info(
  [
    `Verified ${applicationName} ${productVersion} for Windows ${architecture}.`,
    `Installer: ${mebibytes(installer.size)} MiB`,
    `Block map: ${mebibytes(blockMap.size)} MiB`,
    `ASAR entries: ${String(asarEntries.length)}`,
    `Signature: ${installerSignatureStatus}`,
  ].join("\n"),
);
