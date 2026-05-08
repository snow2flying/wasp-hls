/**
 * Typecheck, lint, formatting, and Rust validation helpers for the repo.
 */

import { join } from "path";
import { exec } from "../utils/exec.mjs";
import { generateWasmAbi } from "./build.mjs";
import { reportStep } from "./report.mjs";

/** @param {string} root */
export async function checkAll(root) {
  await generateWasmAbi(root);
  await checkMain(root);
  await checkWorker(root);
  await checkCommon(root);
  await checkDemo(root);
}

/** @param {string} root */
export async function checkMain(root) {
  reportStep("CHECK", "typechecking ts-main...");
  await exec("tsc", ["--project", "./src/ts-main", "--noEmit"], { cwd: root });
  reportStep("CHECK", "linting ts-main...");
  await exec("eslint", ["."], { cwd: join(root, "src", "ts-main") });
}

/** @param {string} root */
export async function checkWorker(root) {
  reportStep("CHECK", "typechecking ts-worker...");
  await exec("tsc", ["--project", "./src/ts-worker", "--noEmit"], {
    cwd: root,
  });
  reportStep("CHECK", "linting ts-worker...");
  await exec("eslint", ["."], { cwd: join(root, "src", "ts-worker") });
  reportStep("CHECK", "linting ts-transmux...");
  await exec("eslint", ["."], { cwd: join(root, "src", "ts-transmux") });
}

/** @param {string} root */
export async function checkCommon(root) {
  reportStep("CHECK", "linting ts-common...");
  await exec("eslint", ["."], { cwd: join(root, "src", "ts-common") });
}

/** @param {string} root */
export async function checkDemo(root) {
  reportStep("CHECK", "typechecking demo...");
  await exec("tsc", ["--project", "./demo", "--noEmit"], { cwd: root });
  reportStep("CHECK", "linting demo...");
  await exec("eslint", ["src/**/*"], { cwd: join(root, "demo") });
}

/** @param {string} root */
export async function checkFmt(root) {
  reportStep("CHECK", "check Rust code formatting...");
  await exec("cargo", ["fmt", "--check"], { cwd: root });
  reportStep("CHECK", "check JS code formatting...");
  await exec("prettier", [".", "--check"], { cwd: root });
}

/** @param {string} root */
export async function checkRust(root) {
  reportStep("CHECK", "run clippy on rust code...");
  await exec("cargo", ["clippy"], { cwd: root });
}
