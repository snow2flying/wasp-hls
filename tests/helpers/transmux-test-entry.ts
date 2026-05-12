import Transmuxer from "../../src/ts-transmux/index.ts";
import {
  getMDHDTimescale,
  getInitTrackInfo,
  getIsobmfTimeInfo,
  getTrackFragmentDecodeTime,
} from "../../src/ts-worker/isobmff-utils.ts";

function getMDHDTimescales(buffer: Uint8Array) {
  return getInitTrackInfo(buffer);
}

function getSegmentTimeInformation(
  buffer: Uint8Array,
  initTrackInfoByTrackId: Map<
    number,
    { timescale: number; type: "audio" | "video" | "other" }
  >,
) {
  const info = getIsobmfTimeInfo(buffer, initTrackInfoByTrackId);
  if (info === null) {
    return null;
  }
  return {
    time: info.time / info.timescale,
    duration:
      info.duration === undefined ? undefined : info.duration / info.timescale,
    timescale: info.timescale,
  };
}

export {
  getMDHDTimescale,
  getMDHDTimescales,
  getSegmentTimeInformation,
  getTrackFragmentDecodeTime,
};
export default Transmuxer;
