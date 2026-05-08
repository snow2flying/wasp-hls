/**
 * ============= check_wasm_abi =============
 *
 * Validates that the built wasm module exports the ABI symbols expected by the
 * JavaScript bindings and imports the ABI symbols expected from the JS host.
 *
 * The expected symbol inventory is defined in `src/wasm/abi/wasm-functions.json`.
 */

import { readFile } from "node:fs/promises";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: node ./scripts/check_wasm_abi.mjs

Checks that build/wasp_hls_bg.wasm matches the expected import/export ABI
defined in src/wasm/abi/wasm-functions.json.`);
  process.exit(0);
}

const wasmPath = new URL("../build/wasp_hls_bg.wasm", import.meta.url);
const functionsManifestPath = new URL(
  "../src/wasm/abi/wasm-functions.json",
  import.meta.url,
);
const { imports: expectedImports, exports: expectedExports } = JSON.parse(
  await readFile(functionsManifestPath, "utf8"),
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
