/**
 * Filesystem helpers shared by build and watch scripts.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "fs";
import { dirname, join } from "path";

/**
 * @param {string} source
 * @param {string} destination
 */
export function copyRecursive(source, destination) {
  const sourceStat = statSync(source);
  if (sourceStat.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      copyRecursive(join(source, entry.name), join(destination, entry.name));
    }
    return;
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

/**
 * @param {string} buildDir
 * @param {{ preserveDemoBundle: boolean }} options
 */
export function cleanBuildDirectory(buildDir, { preserveDemoBundle }) {
  const keep = new Set([
    "README.md",
    "favicon.png",
    "index.html",
    "logo-white.png",
    "style.css",
  ]);
  if (preserveDemoBundle) {
    keep.add("demo.js");
  }
  if (!existsSync(buildDir)) {
    return;
  }
  for (const entry of readdirSync(buildDir)) {
    if (keep.has(entry)) {
      continue;
    }
    rmSync(join(buildDir, entry), { force: true, recursive: true });
  }
}
