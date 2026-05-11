// Using the 90kHz clock
const ONE_SECOND_IN_TS = 90000;

function secondsToVideoTs(seconds: number): number {
  return seconds * ONE_SECOND_IN_TS;
}

function secondsToAudioTs(seconds: number, sampleRate: number): number {
  return seconds * sampleRate;
}

function videoTsToSeconds(timestamp: number): number {
  return timestamp / ONE_SECOND_IN_TS;
}

function audioTsToSeconds(timestamp: number, sampleRate: number): number {
  return timestamp / sampleRate;
}

function audioTsToVideoTs(timestamp: number, sampleRate: number): number {
  return secondsToVideoTs(audioTsToSeconds(timestamp, sampleRate));
}

function videoTsToAudioTs(timestamp: number, sampleRate: number): number {
  return secondsToAudioTs(videoTsToSeconds(timestamp), sampleRate);
}

/** A timescaled unit, on 64 bits. */
export interface ITimescaledU64 {
  /** High 4 bytes. */
  hi: number;
  /** Low 4 bytes. */
  lo: number;
  /** Timescale used for that timestamp. */
  timescale: number;
}

/**
 * Translate the given timescale unit to seconds, avoiding potential for
 * overflows as much as possible.
 * @param t - The timescaled data.
 * @returns - correspondance in seconds.
 */
export function timescaledU64ToSeconds(t: ITimescaledU64): number {
  const BASE = 0x10000; // 2^16
  if (t.timescale === 0) {
    throw new RangeError("timescale must be non-zero");
  }

  const parts = [
    Math.floor(t.hi / BASE),
    t.hi % BASE,
    Math.floor(t.lo / BASE),
    t.lo % BASE,
  ];

  let rem = 0;
  let q = 0;

  for (const part of parts) {
    const n = rem * BASE + part; // always safe: < 2^48
    const digit = Math.floor(n / t.timescale);
    rem = n % t.timescale;

    if (q > (Number.MAX_SAFE_INTEGER - digit) / BASE) {
      throw new RangeError("seconds exceed Number.MAX_SAFE_INTEGER");
    }

    q = q * BASE + digit;
  }

  return q + rem / t.timescale;
}

/**
 * Convert/normalize the given timescale value to the timescale we're relying on here for
 * video.
 * @param baseTime - The timescaled value to convert.
 * @returns - The value converted in the right timescale.
 */
export function getTimescaledValueToVideoTimescale(
  baseTime: ITimescaledU64,
): number {
  const BASE = 0x10000; // 2^16
  const { hi, lo, timescale } = baseTime;
  if (timescale === 0) {
    throw new Error("Invalid timescale");
  }

  // u64 split into 4 base-2^16 limbs
  const parts = [hi >>> 16, hi & 0xffff, lo >>> 16, lo & 0xffff];

  let quotient = 0;
  let remainder = 0;

  // Compute floor(u64 / timescale) safely
  for (const part of parts) {
    const n = remainder * BASE + part;
    quotient = quotient * BASE + Math.floor(n / timescale);
    remainder = n % timescale;
  }

  // round(u64 * ONE_SECOND_IN_TS / timescale)
  return Math.max(
    0,
    quotient * ONE_SECOND_IN_TS +
      Math.round((remainder * ONE_SECOND_IN_TS) / timescale),
  );
}
/**
 * Adjust ID3 tag or caption timing information by the timeline pts values
 * (if keepOriginalTimestamps is false) and convert to seconds
 */
function metadataTsToSeconds(
  timestamp: number,
  timelineStartPts: number,
  keepOriginalTimestamps: boolean,
): number {
  return videoTsToSeconds(
    keepOriginalTimestamps ? timestamp : timestamp - timelineStartPts,
  );
}

export {
  ONE_SECOND_IN_TS,
  secondsToVideoTs,
  secondsToAudioTs,
  videoTsToSeconds,
  audioTsToSeconds,
  audioTsToVideoTs,
  videoTsToAudioTs,
  metadataTsToSeconds,
};
