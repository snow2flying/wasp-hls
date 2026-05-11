import type { AacFrame } from "./AdtsPacketParser.ts";
import {
  prefixWithSilence,
  trimAdtsFramesByEarliestDts,
  generateSampleTable as generateAudioSampleTable,
  concatenateFrameData,
} from "./audio-frame-utils.ts";
import { createMdat, createMoof } from "./mp4-utils.ts";
import {
  calculateTrackBaseMediaDecodeTime,
  clearDtsInfo,
  collectDtsInfo,
} from "./track-utils.ts";
import type { TrackInfo } from "./types.ts";

export interface Mp4AudioSegmentData {
  trackInfo: TrackInfo;
  boxes: Uint8Array;
  timingInfo: {
    start: number;
    end: number;
  };
}

/**
 * Constructs a single-track, ISOBMFF media segment from AAC frames.
 * @class Mp4AudioSegmentGenerator
 */
export class Mp4AudioSegmentGenerator {
  private _aacFrames: AacFrame[];
  private _sequenceNumber: number;
  private _trackInfo: TrackInfo;

  /**
   * @param {Object} trackInfo
   */
  constructor(trackInfo: TrackInfo, firstSequenceNumber?: number) {
    this._aacFrames = [];
    this._sequenceNumber = firstSequenceNumber ?? 0;
    this._trackInfo = trackInfo;
  }

  public pushAacFrame(data: AacFrame): void {
    collectDtsInfo(this._trackInfo, data);
    this._trackInfo.audioobjecttype = data.audioobjecttype;
    this._trackInfo.channelcount = data.channelcount;
    this._trackInfo.samplerate = data.samplerate;
    this._trackInfo.samplingfrequencyindex = data.samplingfrequencyindex;
    this._trackInfo.samplesize = data.samplesize;
    this._aacFrames.push(data);
  }

  public generateBoxes(args: {
    earliestAllowedDts: number;
    videoBaseMediaDecodeTime: number | undefined;
    audioAppendStartTs: number;
    keepOriginalTimestamps: boolean;
  }): Mp4AudioSegmentData | null {
    if (this._aacFrames.length === 0) {
      return null;
    }

    const {
      keepOriginalTimestamps,
      earliestAllowedDts,
      videoBaseMediaDecodeTime,
      audioAppendStartTs,
    } = args;

    const frames = trimAdtsFramesByEarliestDts(
      this._aacFrames,
      this._trackInfo,
      earliestAllowedDts,
    );
    const { canonicalBaseMediaDecodeTime, trackBaseMediaDecodeTime } =
      calculateTrackBaseMediaDecodeTime(
        this._trackInfo,
        keepOriginalTimestamps,
      );

    this._trackInfo.baseMediaDecodeTime = trackBaseMediaDecodeTime;

    if (videoBaseMediaDecodeTime !== undefined) {
      // amount of audio filled but the value is in video clock rather than audio clock
      prefixWithSilence(
        this._trackInfo,
        frames,
        audioAppendStartTs,
        videoBaseMediaDecodeTime,
      );
    }

    // we have to build the index from byte locations to
    // samples (that is, adts frames) in the audio data
    this._trackInfo.samples = generateAudioSampleTable(frames);

    // concatenate the audio data to constuct the mdat
    const mdat = createMdat(concatenateFrameData(frames));

    this._aacFrames = [];

    const moof = createMoof(this._sequenceNumber, [this._trackInfo]);
    const boxes = new Uint8Array(moof.byteLength + mdat.byteLength);

    // bump the sequence number for next time
    this._sequenceNumber++;

    boxes.set(moof);
    boxes.set(mdat, moof.byteLength);

    const continuityStart = canonicalBaseMediaDecodeTime;
    const lastFrame = frames[frames.length - 1];
    const continuityEnd =
      lastFrame === undefined
        ? continuityStart
        : lastFrame.dts +
          ((lastFrame.sampleCount ?? 1024) * 90000) /
            this._trackInfo.samplerate;

    clearDtsInfo(this._trackInfo);

    return {
      trackInfo: this._trackInfo,
      boxes,
      timingInfo: {
        start: continuityStart,
        end: continuityEnd,
      },
    };
  }

  public cancel(): void {
    clearDtsInfo(this._trackInfo);
    this._aacFrames = [];
  }
}
