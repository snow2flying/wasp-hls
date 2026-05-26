# WASM ABI manifest

This directory contains the shared manifest that documents and generates the
lowest-level JS/WASM boundary used by Wasp HLS.

## Files

- `wasm-enums.json`: enum manifest consumed by `generate_wasm_abi_enums.mjs`
- `wasm-functions.jsonc`: function/signature manifest consumed by
  `generate_wasm_abi_bindings.mjs` and `check_wasm_abi.mjs`

## Manifest structure

Each import entry describes one function implemented by JavaScript and called by
Rust:

- `wasmSymbol`: raw symbol expected by the compiled wasm module
- `doc`: generated documentation lines propagated into Rust and TypeScript
- `typescript`: high-level TypeScript signature used for `HostBindings`
  - `methodName`: host-facing TypeScript method name
  - `args`: Description of arguments for that method, in order and with
    TypeScript semantics.
  - `returnType`: The Typescript return type.
- `rust`: low-level Rust ABI signature used for raw wasm imports
  - `args`: Description of arguments for that method, in order and with
    Rust semantics.
  - `returnType`: The Rust return type.

Each export entry describes one wasm export consumed by JavaScript:

- `wasmSymbol`: raw exported symbol name
- `doc`: generated documentation lines propagated into TypeScript
- `wasm`: generated TypeScript export shape

`wasm.kind` is either:

- `property`: for non-callable exports such as `memory`
- `method`: for callable exports

## Generation outputs

`node ./scripts/generate_wasm_abi_bindings.mjs` generates:

- `src/rs-core/bindings/js_functions/raw_wasm.rs`
- `src/rs-core/bindings/js_functions/raw_host.rs`
- `src/wasm/js/generatedTypes.ts`

`node ./scripts/generate_wasm_abi_enums.mjs` generates:

- `src/rs-core/bindings/abi_types.rs`
- `src/ts-common/generatedWasmEnums.ts`

`node ./scripts/check_wasm_abi.mjs` validates that the built wasm binary still
matches the symbol inventory declared by `wasm-functions.jsonc`.

## What belongs in the manifest

Put a function in the manifest when:

- its raw ABI signature is part of the stable JS/WASM contract
- its TypeScript or Rust declaration is repetitive
- its documentation should stay synchronized across generated outputs

Keep higher-level marshalling logic handwritten when:

- it packs or unpacks domain-shaped payloads
- it conditionally allocates memory
- it needs control flow that would make the manifest behave like a DSL

Examples today include `appendBuffer`, `inspectSegment`, and
`__web_event__playback_tick`: their signatures are generated, but the actual
marshalling code remains manual.

## Update workflow

1. Edit `wasm-functions.jsonc`.
2. Run `npm run generate`.
3. Run the relevant checks or builds.
4. If the wasm binary ABI changed, `check_wasm_abi.mjs` must still pass.
