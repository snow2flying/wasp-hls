// @ts-check

import { existsSync } from "fs";
import { resolve } from "path";
import { commandExists } from "./utils.mjs";

/**
 * Resolve the path (or command name) for the GPAC CLI binary.
 *
 * @param {string} tmpDir
 * @param {string} [explicitPath]
 * @returns {Promise<string>}
 */
export async function resolveGpacBinary(tmpDir, explicitPath) {
  if (explicitPath) {
    return explicitPath;
  }

  const cachedBinary = normalizeDownloadedGpacBinaryPath(tmpDir);
  if (cachedBinary !== null) {
    return cachedBinary;
  }

  if (commandExists("gpac")) {
    return "gpac";
  }

  const installedWindowsBinary = findInstalledWindowsGpacBinary();
  if (installedWindowsBinary !== null) {
    return installedWindowsBinary;
  }

  throw new Error(
    "GPAC not installed on this machine. Please install and make it available to PATH before running the packager.",
  );
}

/**
 * @param {string} tmpDir
 * @returns {string | null}
 */
function normalizeDownloadedGpacBinaryPath(tmpDir) {
  const binary = resolve(tmpDir, "gpac");
  const binaryExe = resolve(tmpDir, "gpac.exe");
  if (existsSync(binaryExe)) {
    return binaryExe;
  }
  if (existsSync(binary)) {
    return binary;
  }
  return null;
}

/**
 * Resolve common Windows install locations when `gpac.exe` is installed but not
 * available on PATH.
 *
 * @returns {string | null}
 */
function findInstalledWindowsGpacBinary() {
  if (process.platform !== "win32") {
    return null;
  }

  const candidates = [
    process.env.ProgramFiles
      ? resolve(process.env.ProgramFiles, "GPAC", "gpac.exe")
      : null,
    process.env["ProgramFiles(x86)"]
      ? resolve(process.env["ProgramFiles(x86)"], "GPAC", "gpac.exe")
      : null,
    process.env.ChocolateyInstall
      ? resolve(process.env.ChocolateyInstall, "bin", "gpac.exe")
      : null,
    process.env.ChocolateyInstall
      ? resolve(
          process.env.ChocolateyInstall,
          "lib",
          "gpac",
          "tools",
          "gpac.exe",
        )
      : null,
    process.env.ChocolateyInstall
      ? resolve(
          process.env.ChocolateyInstall,
          "lib",
          "gpac.portable",
          "tools",
          "gpac.exe",
        )
      : null,
  ];

  for (const candidate of candidates) {
    if (candidate !== null && existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
