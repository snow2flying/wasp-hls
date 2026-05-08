import { createWasmImports } from "./imports.js";
import { setWasmExports } from "./memory.js";
import type {
  HostBindings,
  InitInput,
  InitOutput,
  InitializeWasmArg,
} from "./types.js";

interface InstantiatedModule {
  instance: WebAssembly.Instance;
}

function toInstantiatedModule(
  result: WebAssembly.Instance | WebAssembly.WebAssemblyInstantiatedSource,
): InstantiatedModule {
  return "instance" in result ? result : { instance: result };
}

function normalizeInitInput(
  input: InitializeWasmArg | undefined,
): InitInput | Promise<InitInput> | undefined {
  if (input && typeof input === "object" && "module_or_path" in input) {
    return input.module_or_path;
  }
  return input;
}

async function instantiate(
  input: InitInput | Promise<InitInput> | undefined,
  bindings: HostBindings,
): Promise<InstantiatedModule> {
  const imports = createWasmImports(bindings);
  if (input instanceof WebAssembly.Module) {
    return { instance: await WebAssembly.instantiate(input, imports) };
  }
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    return toInstantiatedModule(await WebAssembly.instantiate(input, imports));
  }
  if (input === undefined) {
    throw new Error("Missing WASM module input");
  }
  const source =
    input instanceof Response
      ? input
      : typeof input === "string" ||
          input instanceof URL ||
          input instanceof Request
        ? fetch(input)
        : input;
  const awaited = await source;
  if (awaited instanceof WebAssembly.Module) {
    return { instance: await WebAssembly.instantiate(awaited, imports) };
  }
  if (awaited instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return toInstantiatedModule(
          await WebAssembly.instantiateStreaming(awaited.clone(), imports),
        );
      } catch {
        return toInstantiatedModule(
          await WebAssembly.instantiate(await awaited.arrayBuffer(), imports),
        );
      }
    }
    return toInstantiatedModule(
      await WebAssembly.instantiate(await awaited.arrayBuffer(), imports),
    );
  }
  return toInstantiatedModule(
    await WebAssembly.instantiate(awaited as BufferSource, imports),
  );
}

export function initSync(
  module: BufferSource | WebAssembly.Module | WebAssembly.Instance,
  bindings: HostBindings,
): InitOutput {
  const imports = createWasmImports(bindings);
  const instance =
    module instanceof WebAssembly.Instance
      ? module
      : new WebAssembly.Instance(module, imports);
  return setWasmExports(instance.exports as unknown as InitOutput);
}

export default async function initializeWasm(
  module_or_path: InitializeWasmArg | undefined,
  bindings: HostBindings,
): Promise<InitOutput> {
  const normalized = normalizeInitInput(module_or_path);
  const result = await instantiate(normalized, bindings);
  return setWasmExports(result.instance.exports as unknown as InitOutput);
}
