import type { InitOutput, WaspWasmExports } from "./types.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: false });

let wasm: WaspWasmExports | undefined;
let cachedUint8Memory: Uint8Array | null = null;
let cachedUint32Memory: Uint32Array | null = null;
let cachedFloat64Memory: Float64Array | null = null;

export function setWasmExports(exports: InitOutput): InitOutput {
  wasm = exports;
  cachedUint8Memory = null;
  cachedUint32Memory = null;
  cachedFloat64Memory = null;
  return exports;
}

export function getWasmExports(): WaspWasmExports {
  if (wasm === undefined) {
    throw new Error("WASM module not initialized");
  }
  return wasm;
}

export function getUint8Memory(): Uint8Array {
  const memory = getWasmExports().memory;
  if (
    cachedUint8Memory === null ||
    cachedUint8Memory.buffer !== memory.buffer
  ) {
    cachedUint8Memory = new Uint8Array(memory.buffer);
  }
  return cachedUint8Memory;
}

export function getUint32Memory(): Uint32Array {
  const memory = getWasmExports().memory;
  if (
    cachedUint32Memory === null ||
    cachedUint32Memory.buffer !== memory.buffer
  ) {
    cachedUint32Memory = new Uint32Array(memory.buffer);
  }
  return cachedUint32Memory;
}

export function getFloat64Memory(): Float64Array {
  const memory = getWasmExports().memory;
  if (
    cachedFloat64Memory === null ||
    cachedFloat64Memory.buffer !== memory.buffer
  ) {
    cachedFloat64Memory = new Float64Array(memory.buffer);
  }
  return cachedFloat64Memory;
}

export function allocBytes(length: number): number {
  return getWasmExports().wasp_malloc(length);
}

export function freeBytes(ptr: number, len: number): void {
  if (ptr !== 0) {
    getWasmExports().wasp_free(ptr, len);
  }
}

export function writeString(str: string): [number, number] {
  const bytes = textEncoder.encode(str);
  const ptr = allocBytes(bytes.length);
  getUint8Memory().set(bytes, ptr);
  return [ptr, bytes.length];
}

export function writeOptionalString(
  str: string | null | undefined,
  ptrOut: number,
  lenOut: number,
): void {
  if (str == null) {
    getUint32Memory()[ptrOut >>> 2] = 0;
    getUint32Memory()[lenOut >>> 2] = 0;
    return;
  }
  const [ptr, len] = writeString(str);
  getUint32Memory()[ptrOut >>> 2] = ptr;
  getUint32Memory()[lenOut >>> 2] = len;
}

export function writeFloat64Array(values: Float64Array): [number, number] {
  const ptr = allocBytes(values.byteLength);
  getUint8Memory().set(
    new Uint8Array(values.buffer, values.byteOffset, values.byteLength),
    ptr,
  );
  return [ptr, values.length];
}

export function readString(ptr: number, len: number): string {
  return textDecoder.decode(getUint8Memory().subarray(ptr, ptr + len));
}

export function readOptionalF64(ptr: number): number | undefined {
  if (ptr === 0) {
    return undefined;
  }
  return getFloat64Memory()[ptr >>> 3];
}

export function withString<T>(
  str: string,
  cb: (ptr: number, len: number) => T,
): T {
  const [ptr, len] = writeString(str);
  try {
    return cb(ptr, len);
  } finally {
    freeBytes(ptr, len);
  }
}

export function withFloat64Array<T>(
  values: Float64Array,
  cb: (ptr: number, len: number) => T,
): T {
  const [ptr, len] = writeFloat64Array(values);
  try {
    return cb(ptr, len);
  } finally {
    freeBytes(ptr, values.byteLength);
  }
}
