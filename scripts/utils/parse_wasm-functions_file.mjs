import { readFile } from "node:fs/promises";

export const WASM_ABI_FUNCTIONS_MANIFEST_PATH = new URL(
  "../../src/wasm/abi/wasm-functions.jsonc",
  import.meta.url,
);

/**
 * Read the ABI configuration file and parse it into a JS Object.
 * @returns - The ABI configuration file parsed.
 */
export default async function readWasmAbiFunctionsManifest() {
  const source = await readFile(WASM_ABI_FUNCTIONS_MANIFEST_PATH, "utf8");
  return parseJsoncObject(source);
}

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
