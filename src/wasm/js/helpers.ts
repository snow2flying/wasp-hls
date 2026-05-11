import {
  getFloat64Memory,
  getUint32Memory,
  writeOptionalString,
} from "./memory.js";
import type { HostResult } from "./types.js";

// TODO: Maybe more safety into that one
const OPTIONAL_ID_NONE = 0xffffffff;

export function unwrapResult<Value, ErrorCode extends number>(
  result: HostResult<Value, ErrorCode>,
  okValue: number,
  errCodeOut: number,
  errDescPtrOut: number,
  errDescLenOut: number,
): number {
  if (result.errorCode === undefined) {
    return okValue;
  }
  getUint32Memory()[errCodeOut >>> 2] = result.errorCode;
  writeOptionalString(result.description, errDescPtrOut, errDescLenOut);
  return 0;
}

export function writeAppendBufferResult(
  result: HostResult<
    {
      start: number | undefined;
      duration: number | undefined;
      continuityEnd:
        | {
            valueHi: number;
            valueLo: number;
            timescale: number;
          }
        | undefined;
    },
    number
  >,
  hasStartOut: number,
  startOut: number,
  hasDurationOut: number,
  durationOut: number,
  hasContinuityEndOut: number,
  continuityEndValueHiOut: number,
  continuityEndValueLoOut: number,
  continuityEndTimescaleOut: number,
  errCodeOut: number,
  errDescPtrOut: number,
  errDescLenOut: number,
): number {
  if (result.errorCode !== undefined) {
    getUint32Memory()[errCodeOut >>> 2] = result.errorCode;
    writeOptionalString(result.description, errDescPtrOut, errDescLenOut);
    return 0;
  }
  const parsed = result.value;
  getUint32Memory()[hasStartOut >>> 2] = parsed?.start == null ? 0 : 1;
  getFloat64Memory()[startOut >>> 3] = parsed?.start ?? 0;
  getUint32Memory()[hasDurationOut >>> 2] = parsed?.duration == null ? 0 : 1;
  getFloat64Memory()[durationOut >>> 3] = parsed?.duration ?? 0;
  getUint32Memory()[hasContinuityEndOut >>> 2] =
    parsed?.continuityEnd == null ? 0 : 1;
  getUint32Memory()[continuityEndValueHiOut >>> 2] =
    parsed?.continuityEnd?.valueHi ?? 0;
  getUint32Memory()[continuityEndValueLoOut >>> 2] =
    parsed?.continuityEnd?.valueLo ?? 0;
  getUint32Memory()[continuityEndTimescaleOut >>> 2] =
    parsed?.continuityEnd?.timescale ?? 0;
  return 1;
}

export function optionalIdToRaw(value: number | undefined): number {
  return value ?? OPTIONAL_ID_NONE;
}

export function rawOptionalId(value: number): number | undefined {
  return value === OPTIONAL_ID_NONE ? undefined : value;
}
