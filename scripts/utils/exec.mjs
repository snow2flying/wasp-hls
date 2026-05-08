/**
 * Process execution helpers shared by build/check/watch scripts.
 */

import { spawn } from "child_process";
import { delimiter, join } from "path";

/**
 * @param {string} commandName
 * @param {string[]} args
 * @param {{ cwd?: string, stdio?: "inherit" | "pipe" | "ignore" }} [options]
 */
export function exec(commandName, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, {
      cwd: options.cwd,
      env: spawnEnv(options.cwd),
      stdio: options.stdio ?? "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal != null) {
        reject(new Error(`${commandName} exited with signal ${signal}.`));
      } else if (code !== 0) {
        reject(new Error(`${commandName} exited with code ${code}.`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Ensure locally installed CLIs remain resolvable even when the task runner is
 * invoked directly through `node` instead of `npm run`.
 *
 * @param {string | undefined} cwd
 * @returns {NodeJS.ProcessEnv}
 */
export function spawnEnv(cwd) {
  const env = { ...process.env };
  const nodeModulesBin = join(cwd ?? process.cwd(), "node_modules", ".bin");
  env.PATH = env.PATH == null ? nodeModulesBin : `${nodeModulesBin}${delimiter}${env.PATH}`;
  return env;
}
