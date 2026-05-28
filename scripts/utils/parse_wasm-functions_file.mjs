import { readFile } from "node:fs/promises";

/**
 * @typedef {{ name: string; type: string }} AbiArg
 * @typedef {{ args: AbiArg[]; returnType: string }} AbiMethodSignature
 * @typedef {{ kind: "method"; args: AbiArg[]; returnType: string } | { kind: "property"; type: string }} AbiWasmSignature
 * @typedef {{
 *   doc: string[];
 *   wasmSymbol: string;
 *   rust: AbiMethodSignature;
 *   typescript: { methodName: string; args: AbiArg[]; returnType: string };
 *   wasm: AbiWasmSignature;
 * }} AbiFunctionManifestEntry
 * @typedef {{ imports?: AbiFunctionManifestEntry[]; exports?: AbiFunctionManifestEntry[] }} WasmAbiFunctionsManifest
 */

export const WASM_ABI_FUNCTIONS_MANIFEST_PATH = new URL(
  "../../src/wasm/abi/wasm-functions.jsonc",
  import.meta.url,
);

/**
 * Read the ABI configuration file and parse it into a JS Object.
 * @returns {Promise<WasmAbiFunctionsManifest>} The ABI configuration file parsed.
 */
export default async function readWasmAbiFunctionsManifest() {
  const source = await readFile(WASM_ABI_FUNCTIONS_MANIFEST_PATH, "utf8");
  return parseJsoncObject(source);
}

/**
 * @param {string} source
 * @returns {WasmAbiFunctionsManifest}
 */
function parseJsoncObject(source) {
  try {
    return Function(
      `"use strict"; return (${source}
);`,
    )();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSONC in wasm ABI manifest: ${message}`);
  }
}
