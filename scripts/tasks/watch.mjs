/**
 * Watch-mode helpers for rebuilding the demo and its runtime dependencies.
 */

import { spawn } from "child_process";
import { existsSync, readdirSync, watch } from "fs";
import { join } from "path";
import { cleanBuildDirectory } from "../utils/fs.mjs";
import { npmExecCommand } from "../utils/exec.mjs";
import {
  buildWasm,
  buildWorker,
  buildDemoBundle,
  generateWasmAbi,
} from "./build.mjs";

/**
 * @param {string} root
 * @param {{ release: boolean }} options
 */
export async function watchDemo(root, { release }) {
  await generateWasmAbi(root);
  cleanBuildDirectory(join(root, "build"), { preserveDemoBundle: true });
  await buildWasm(root, { release, skipGenerate: true });
  await buildWorker(root, { release });

  const esbuild = npmExecCommand("esbuild", [
    "demo/src/index.tsx",
    "--bundle",
    "--outfile=build/demo.js",
    "--tsconfig=demo/tsconfig.json",
    ...(release ? ["--minify"] : []),
    "--watch",
  ]);
  const demoWatcher = spawn(esbuild.command, esbuild.args, {
    cwd: root,
    stdio: "inherit",
  });

  let buildQueue = Promise.resolve();
  const enqueue = (label, task) => {
    buildQueue = buildQueue
      .then(async () => {
        console.log(`[watch] rebuilding ${label}...`);
        await task();
        console.log(`[watch] rebuilt ${label}`);
      })
      .catch((error) => {
        console.error(
          `[watch] ${label} rebuild failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  };

  const watchTree = createTreeWatcher(root, [
    {
      roots: ["src/rs-core", "scripts", "."],
      filter: (path) =>
        (path.includes("src/rs-core/") &&
          !path.endsWith("src/rs-core/bindings/abi_types.rs")) ||
        path === "Cargo.toml" ||
        path === "Cargo.lock" ||
        path.endsWith("scripts/generate_wasm_abi_enums.mjs") ||
        path.endsWith("scripts/generate_wasm_abi_bindings.mjs") ||
        path.endsWith("scripts/check_wasm_abi.mjs") ||
        path.endsWith("scripts/wasm-strip.js"),
      onChange: () =>
        enqueue("wasm and worker", async () => {
          await buildWasm(root, { release });
          await buildWorker(root, { release });
        }),
    },
    {
      roots: ["src/ts-worker", "src/ts-transmux", "src/ts-common", "src/wasm"],
      filter: (path) =>
        path !== "src/wasm/wasp_hls_bg.wasm" &&
        path !== "src/ts-common/generatedWasmEnums.ts" &&
        path !== "src/wasm/js/generatedTypes.ts",
      onChange: () => enqueue("worker", () => buildWorker(root, { release })),
    },
    {
      roots: [".", "demo", "src/ts-main", "src/ts-worker"],
      filter: (path) =>
        path === "demo/tsconfig.json" ||
        path === "src/ts-main/tsconfig.json" ||
        path === "src/ts-worker/tsconfig.json" ||
        path === "src/tsconfig.base.json",
      onChange: () =>
        enqueue("demo, worker, and main-thread config consumers", async () => {
          await buildWorker(root, { release });
          await buildDemoBundle(root, { release });
        }),
    },
  ]);

  const closeAll = () => {
    watchTree.close();
    demoWatcher.kill("SIGTERM");
  };
  process.on("SIGINT", closeAll);
  process.on("SIGTERM", closeAll);

  await new Promise((resolve, reject) => {
    demoWatcher.on("error", reject);
    demoWatcher.on("exit", (code, signal) => {
      process.off("SIGINT", closeAll);
      process.off("SIGTERM", closeAll);
      watchTree.close();
      if (signal === "SIGTERM" || signal === "SIGINT" || code === 0) {
        resolve();
      } else {
        reject(
          new Error(`esbuild watch exited with ${signal ?? `code ${code}`}.`),
        );
      }
    });
  });
}

/**
 * @param {string} root
 * @param {Array<{ roots: string[], filter: (path: string) => boolean, onChange: () => void }>} configs
 */
function createTreeWatcher(root, configs) {
  const watchers = new Map();
  const refreshTimers = new Map();
  const triggerTimers = new Map();

  const watcherKey = (watchRoot, dir) => `${watchRoot}\n${dir}`;

  const refreshRoot = (watchRoot) => {
    const absoluteRoot = join(root, watchRoot);
    const nextDirectories = new Set(listDirectories(absoluteRoot));

    for (const [key, handle] of watchers) {
      const separatorIndex = key.indexOf("\n");
      const keyWatchRoot = key.slice(0, separatorIndex);
      const dir = key.slice(separatorIndex + 1);
      if (keyWatchRoot !== watchRoot) {
        continue;
      }
      if (!nextDirectories.has(dir)) {
        handle.close();
        watchers.delete(key);
      }
    }

    for (const dir of nextDirectories) {
      const key = watcherKey(watchRoot, dir);
      if (watchers.has(key)) continue;
      const handle = watch(dir, (_eventType, filename) => {
        scheduleRefresh(watchRoot);
        if (filename == null) return;
        const relativePath = relativeFromRoot(
          root,
          join(dir, filename.toString()),
        );
        for (const config of configs) {
          if (config.roots.includes(watchRoot) && config.filter(relativePath)) {
            scheduleTrigger(config, relativePath);
          }
        }
      });
      watchers.set(key, handle);
    }
  };

  const scheduleRefresh = (watchRoot) => {
    clearTimeout(refreshTimers.get(watchRoot));
    refreshTimers.set(
      watchRoot,
      setTimeout(() => {
        refreshTimers.delete(watchRoot);
        refreshRoot(watchRoot);
      }, 100),
    );
  };

  const scheduleTrigger = (config, changedPath) => {
    clearTimeout(triggerTimers.get(config));
    triggerTimers.set(
      config,
      setTimeout(() => {
        triggerTimers.delete(config);
        console.log(`[watch] change detected in ${changedPath}`);
        config.onChange();
      }, 120),
    );
  };

  for (const config of configs) {
    for (const watchRoot of config.roots) {
      refreshRoot(watchRoot);
    }
  }

  return {
    close() {
      for (const timer of refreshTimers.values()) clearTimeout(timer);
      for (const timer of triggerTimers.values()) clearTimeout(timer);
      for (const handle of watchers.values()) handle.close();
    },
  };
}

function listDirectories(root) {
  if (!existsSync(root)) return [];
  const directories = [root];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      directories.push(...listDirectories(join(root, entry.name)));
    }
  }
  return directories;
}

function relativeFromRoot(root, path) {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}
