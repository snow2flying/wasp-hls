// @ts-check

import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import {
  PACKAGER_STARTUP_TIMEOUT_MS,
  PACKAGER_STARTUP_POLL_INTERVAL_MS,
} from "./constants.mjs";
import { commandExists } from "./utils.mjs";

/**
 * Resolve the path (or command name) for the GPAC CLI binary.
 *
 * @param {string} tmpDir
 * @param {string} scriptDir
 * @param {boolean} noConfirm
 * @param {string} [explicitPath]
 * @returns {Promise<string>}
 */
export async function resolveGpacBinary(
  tmpDir,
  scriptDir,
  noConfirm,
  explicitPath,
) {
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

  if (!(await downloadGpac(tmpDir, scriptDir, noConfirm))) {
    throw new Error("Failed to install GPAC");
  }

  const downloadedBinary = normalizeDownloadedGpacBinaryPath(tmpDir);
  if (downloadedBinary === null) {
    throw new Error("Failed to resolve installed GPAC binary");
  }
  return downloadedBinary;
}

/**
 * Poll until GPAC is listening on every expected UDP port, or reject after
 * PACKAGER_STARTUP_TIMEOUT_MS.
 *
 * Falls back to a 3-second sleep when neither `ss` nor `netstat` is available.
 *
 * @param {number[]} portList
 * @returns {Promise<void>}
 */
export async function waitForGpacReady(portList) {
  const uniquePorts = [...new Set(portList)];
  const canPoll = commandExists("ss") || commandExists("netstat");

  if (!canPoll) {
    console.warn(
      "Warning: Cannot poll UDP ports (no ss/netstat). Falling back to 3s sleep.",
    );
    await sleep(3000);
    return;
  }

  console.log(`Waiting for GPAC to bind UDP ports: ${uniquePorts.join(", ")}...`);

  const deadline = Date.now() + PACKAGER_STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(PACKAGER_STARTUP_POLL_INTERVAL_MS);

    if (allPortsListening(uniquePorts)) {
      console.log("GPAC is ready.");
      return;
    }
  }

  throw new Error(
    `Timed out waiting for GPAC to bind ports after ${PACKAGER_STARTUP_TIMEOUT_MS}ms.`,
  );
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Returns true if all `ports` appear in the current UDP listener list.
 *
 * @param {number[]} ports
 * @returns {boolean}
 */
function allPortsListening(ports) {
  let output = "";
  try {
    if (commandExists("ss")) {
      output = execFileSync("ss", ["-uln"], { encoding: "utf8" });
    } else {
      const netstatArgs =
        process.platform === "win32" ? ["-a", "-n", "-p", "UDP"] : ["-uln"];
      output = execFileSync("netstat", netstatArgs, { encoding: "utf8" });
    }
  } catch {
    return false;
  }
  return ports.every(
    (port) => output.includes(`:${port} `) || output.includes(`:${port}\t`),
  );
}

/**
 * Try to download GPAC via the install script.
 *
 * @param {string} tmpDir
 * @param {string} scriptDir
 * @param {boolean} noConfirm
 * @returns {Promise<boolean>}
 */
async function downloadGpac(tmpDir, scriptDir, noConfirm) {
  console.log("No GPAC binary found locally...");

  const installScript = resolve(scriptDir, "install_gpac.sh");
  if (!existsSync(installScript)) {
    throw new Error(
      `install_gpac.sh not found at ${installScript}. Cannot install GPAC automatically.`,
    );
  }
  console.log(
    `We will load the GPAC binary locally in the "${tmpDir}" directory`,
  );

  const args = noConfirm ? ["--no-confirmation"] : [];
  try {
    execFileSync("bash", [installScript, ...args], { stdio: "inherit" });
  } catch {
    return false;
  }

  if (normalizeDownloadedGpacBinaryPath(tmpDir) === null) {
    console.error("ERROR: GPAC binary was not successfully installed\n");
    return false;
  }

  return true;
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
