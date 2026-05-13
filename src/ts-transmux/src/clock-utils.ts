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

/**
 * Convert/normalize the given timescale value to the timescale we're relying on here for
 * video.
 * @param value - The timescaled value to convert.
 * @param timescale - The timescale currently associated to that value.
 * @returns - The value converted in the right timescale.
 */
export function toVideoTsFromTimescale(
  value: number,
  timescale: number,
): number {
  if (timescale === 0) {
    throw new Error("Invalid timescale");
  }
  return Math.max(0, Math.round((value * ONE_SECOND_IN_TS) / timescale));
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
