/**
 * ============= check_wasm_abi =============
 *
 * Validates that the built wasm module exports the ABI symbols expected by the
 * JavaScript bindings and imports the ABI symbols expected from the JS host.
 *
 * The expected symbol inventory is defined in `src/wasm/abi/wasm-functions.jsonc`.
 */

import { readFile } from "node:fs/promises";
import readWasmAbiFunctionsManifest from "./utils/parse_wasm-functions_file.mjs";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: node ./scripts/check_wasm_abi.mjs

Checks that build/wasp_hls_bg.wasm matches the expected import/export ABI
defined in src/wasm/abi/wasm-functions.jsonc.`);
  process.exit(0);
}

const wasmPath = new URL("../build/wasp_hls_bg.wasm", import.meta.url);
const manifest = await readWasmAbiFunctionsManifest();
const expectedImports = (manifest.imports ?? []).map(
  /** @param {AbiFunctionManifestEntry} entry */
  (entry) => entry.wasmSymbol,
);
const expectedExports = (manifest.exports ?? []).map(
  /** @param {AbiFunctionManifestEntry} entry */
  (entry) => entry.wasmSymbol,
);

const bytes = await readFile(wasmPath);
const module = await WebAssembly.compile(bytes);
const imports = WebAssembly.Module.imports(module)
  .filter((entry) => entry.module === "wasp")
  .map((entry) => entry.name)
  .sort();
const exports = WebAssembly.Module.exports(module)
  .map((entry) => entry.name)
  .sort();

/**
 * @param {string[]} expected
 * @param {string[]} actual
 * @returns {string[]}
 */
function diff(expected, actual) {
  return expected.filter((value) => !actual.includes(value));
}

const missingImports = diff(expectedImports, imports);
const missingExports = diff(expectedExports, exports);

if (missingImports.length !== 0 || missingExports.length !== 0) {
  const messages = [];
  if (missingImports.length !== 0) {
    messages.push(`Missing wasm imports: ${missingImports.join(", ")}`);
  }
  if (missingExports.length !== 0) {
    messages.push(`Missing wasm exports: ${missingExports.join(", ")}`);
  }
  throw new Error(messages.join("\n"));
}

console.log("WASM ABI check passed.");
/** @typedef {import("./utils/parse_wasm-functions_file.mjs").AbiFunctionManifestEntry} AbiFunctionManifestEntry */
