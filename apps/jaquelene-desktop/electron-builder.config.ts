import type { Configuration } from "electron-builder";
import packageManifest from "./package.json" with { type: "json" };
import { applicationId } from "./src/application";

const applicationName = packageManifest.productName;
const applicationPublisher = packageManifest.author;

const config = {
  appId: applicationId,
  copyright: `Copyright \u00a9 2026 ${applicationPublisher}`,
  artifactName: `${applicationName}-\${version}-windows-\${arch}-setup.\${ext}`,
  asar: true,
  electronLanguages: ["en-US"],
  directories: {
    output: "../../release/jaquelene-desktop",
  },
  files: ["dist-electron/**", "package.json"],
  extraResources: [
    {
      from: "../jaquelene-web/dist",
      to: "web",
    },
  ],
  win: {
    executableName: applicationName,
    requestedExecutionLevel: "asInvoker",
    signAndEditExecutable: true,
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
    differentialPackage: true,
    shortcutName: applicationName,
  },
} satisfies Configuration;

export default config;
