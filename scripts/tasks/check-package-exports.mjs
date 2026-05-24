/**
 * Validates the packed npm artifact from a consumer point of view.
 */

import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { execFileSync } from "child_process";
import { build as esbuild } from "esbuild";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Validate the packed npm package from a consumer point of view.
 * @param {string} root
 * @returns {Promise<void>}
 */
export async function checkPackageExports(root) {
  const rootPackageJson = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  const expectedTarballName = `${rootPackageJson.name
    .replace(/^@/, "")
    .replace(/\//g, "-")}-${rootPackageJson.version}.tgz`;
  const tempDir = mkdtempSync(join(tmpdir(), "wasp-hls-pack-check-"));
  const npmCacheDir = join(tempDir, "npm-cache");
  const packDir = join(tempDir, "pack");
  const unpackDir = join(tempDir, "unpacked");
  const consumerDir = join(tempDir, "consumer");
  const repoTarballPath = join(root, expectedTarballName);

  try {
    mkdirSync(npmCacheDir, { recursive: true });
    mkdirSync(packDir, { recursive: true });
    mkdirSync(unpackDir, { recursive: true });
    mkdirSync(consumerDir, { recursive: true });

    rmSync(repoTarballPath, { force: true });

    const npmPackOutput = execOutsideRepo(
      "npm",
      ["pack", "--silent"],
      root,
      npmCacheDir,
    ).trim();
    const filename = getPackedFilename(expectedTarballName, npmPackOutput);

    copyFileSync(repoTarballPath, join(packDir, filename));
    const packagedFiles = new Set(
      execOutsideRepo("tar", ["-tzf", repoTarballPath], root, npmCacheDir)
        .split("\n")
        .map((entry) => entry.trim())
        .filter((entry) => entry.startsWith("package/"))
        .map((entry) => entry.slice("package/".length))
        .filter(Boolean),
    );
    const requiredFiles = [
      "build/es6/ts-main/index.js",
      "build/es6/ts-main/index.d.ts",
      "build/embedded/wasm.js",
      "build/embedded/wasm.d.ts",
      "build/embedded/worker.js",
      "build/embedded/worker.d.ts",
      "build/worker.js",
      "build/wasp_hls_bg.wasm",
    ];
    for (const requiredFile of requiredFiles) {
      if (!packagedFiles.has(requiredFile)) {
        throw new Error(`Packed tarball is missing "${requiredFile}".`);
      }
    }

    execOutsideRepo(
      "tar",
      ["-xzf", repoTarballPath, "-C", unpackDir],
      root,
      npmCacheDir,
    );
    const unpackedPackageDir = join(unpackDir, "package");
    const unpackedPackageJson = JSON.parse(
      readFileSync(join(unpackedPackageDir, "package.json"), "utf8"),
    );
    assertExports(unpackedPackageJson);

    writeFileSync(
      join(consumerDir, "package.json"),
      JSON.stringify(
        {
          name: "wasp-hls-package-check",
          private: true,
          type: "module",
        },
        null,
        2,
      ),
    );
    execOutsideRepo(
      "npm",
      ["install", join(packDir, filename)],
      consumerDir,
      npmCacheDir,
    );

    const entryFile = join(consumerDir, "entry.js");
    writeFileSync(
      entryFile,
      `import WaspHlsPlayer from "wasp-hls";
import EmbeddedWasm from "wasp-hls/wasm";
import EmbeddedWorker from "wasp-hls/worker";

void [WaspHlsPlayer, EmbeddedWasm, EmbeddedWorker];
`,
    );

    await esbuild({
      entryPoints: [entryFile],
      bundle: true,
      format: "esm",
      platform: "browser",
      outfile: join(consumerDir, "bundle.js"),
      logLevel: "silent",
    });
  } finally {
    rmSync(repoTarballPath, { force: true });
    rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * @param {string} expectedTarballName
 * @param {string} npmPackOutput
 * @returns {string}
 */
function getPackedFilename(expectedTarballName, npmPackOutput) {
  const trimmedOutput = npmPackOutput.trim();
  if (trimmedOutput.length > 0 && trimmedOutput.endsWith(".tgz")) {
    return trimmedOutput;
  }
  return expectedTarballName;
}

/**
 * Execute a command and return its stdout, throwing with richer diagnostics if
 * it fails.
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @param {string} npmCacheDir
 * @returns {string}
 */
function execOutsideRepo(command, args, cwd, npmCacheDir) {
  const resolved = resolveCommand(command, args);
  try {
    return execFileSync(resolved.command, resolved.args, {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_cache: npmCacheDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (error instanceof Error && "stdout" in error && "stderr" in error) {
      const stdout =
        typeof error.stdout === "string" && error.stdout.length > 0
          ? `\nstdout:\n${error.stdout}`
          : "";
      const stderr =
        typeof error.stderr === "string" && error.stderr.length > 0
          ? `\nstderr:\n${error.stderr}`
          : "";
      throw new Error(`${error.message}${stdout}${stderr}`);
    }
    throw error;
  }
}

/**
 * Resolve commands that need platform-specific launching behavior.
 * In particular, invoking `npm` directly is unreliable on Windows without
 * either reusing npm's JS entrypoint or going through `cmd.exe`.
 *
 * @param {string} command
 * @param {string[]} args
 * @returns {{ command: string, args: string[] }}
 */
function resolveCommand(command, args) {
  if (command !== "npm") {
    return { command, args };
  }

  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, ...args],
    };
  }

  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      // `/d` disables AutoRun hooks, `/s` preserves quoting for the command
      // string passed to `cmd`, and `/c` runs it then exits.
      args: ["/d", "/s", "/c", "npm", ...args],
    };
  }

  return { command: "npm", args };
}

/**
 * @param {Record<string, unknown>} packageJson
 */
function assertExports(packageJson) {
  const expectedExports = {
    ".": {
      types: "./build/es6/ts-main/index.d.ts",
      default: "./build/es6/ts-main/index.js",
    },
    "./wasm": {
      types: "./build/embedded/wasm.d.ts",
      default: "./build/embedded/wasm.js",
    },
    "./worker": {
      types: "./build/embedded/worker.d.ts",
      default: "./build/embedded/worker.js",
    },
  };

  if (JSON.stringify(packageJson.exports) !== JSON.stringify(expectedExports)) {
    throw new Error(
      "Unexpected package exports.\n" +
        `Expected: ${JSON.stringify(expectedExports)}\n` +
        `Received: ${JSON.stringify(packageJson.exports)}`,
    );
  }
}
