import type {
  AddSourceBufferErrorCode,
  AttachMediaSourceErrorCode,
  EndOfStreamErrorCode,
  LogLevel,
  MediaPlaylistParsingErrorCode,
  MediaSourceDurationUpdateErrorCode,
  MediaSourceReadyState,
  MediaType,
  MultivariantPlaylistParsingErrorCode,
  OtherErrorCode,
  PlaybackTickReason,
  PlaylistNature,
  PlaylistType,
  PushedSegmentErrorCode,
  RemoveBufferErrorCode,
  RemoveMediaSourceErrorCode,
  RequestErrorReason,
  SegmentParsingErrorCode,
  SourceBufferCreationErrorCode,
  StartingPositionType,
  TimerReason,
} from "./enums.js";

export interface AppendBufferValue {
  start: number | undefined;
  duration: number | undefined;
}

export type AppendResetReason =
  | "none"
  | "seek"
  | "playlist-discontinuity"
  | "variant-switch"
  | "audio-track-switch"
  | "init-segment-change"
  | "buffer-flush";

export interface AppendContinuityInfo {
  start: number;
  duration: number | undefined;
  contiguous: boolean;
  resetReason: AppendResetReason;
}

export interface InspectSegmentValue {
  codec: string;
  mimeType: string;
  mediaType: MediaType;
}

export interface HostResult<Value, ErrorCode extends number> {
  value: Value | undefined;
  errorCode: ErrorCode | undefined;
  description: string | undefined;
}

export interface HostBindings {
  log(logLevel: LogLevel, log: string): void;
  timer(duration: number, reason: TimerReason): number;
  clearTimer(id: number): void;
  getResourceData(id: number): Uint8Array | undefined;
  fetch(
    url: string,
    rangeBase: number | undefined,
    rangeEnd: number | undefined,
    timeout: number,
  ): number;
  abortRequest(requestId: number): boolean;
  attachMediaSource(): HostResult<true, AttachMediaSourceErrorCode>;
  removeMediaSource(): HostResult<true, RemoveMediaSourceErrorCode>;
  setMediaSourceDuration(
    duration: number,
  ): HostResult<true, MediaSourceDurationUpdateErrorCode>;
  addSourceBuffer(
    mediaType: MediaType,
    typ: string,
  ): HostResult<number, AddSourceBufferErrorCode>;
  isTypeSupported(mediaType: MediaType, typ: string): boolean | undefined;
  inspectSegment(
    resourceId: number,
  ): HostResult<InspectSegmentValue, SegmentParsingErrorCode>;
  appendBuffer(
    sourceBufferId: number,
    resourceId: number,
    parseTimeInformation: boolean,
    continuityInfo?: AppendContinuityInfo,
  ): HostResult<AppendBufferValue, SegmentParsingErrorCode>;
  removeBuffer(
    sourceBufferId: number,
    start: number,
    end: number,
  ): HostResult<true, RemoveBufferErrorCode>;
  endOfStream(): HostResult<true, EndOfStreamErrorCode>;
  startObservingPlayback(): void;
  stopObservingPlayback(): void;
  freeResource(resourceId: number): boolean;
  setPlaybackRate(playbackRate: number): void;
  seek(position: number): void;
  flush(): void;
  setMediaOffset(mediaOffset: number): void;
  updateContentInfo(
    minimumPosition: number | undefined,
    maximumPosition: number | undefined,
    playlistNature: PlaylistNature,
  ): void;
  announceFetchedContent(
    playlistType: PlaylistType,
    variantInfo: Uint32Array,
    audioTracksInfo: Uint32Array,
  ): void;
  announceVariantUpdate(variantId: number | undefined): void;
  announceTrackUpdate(
    mediaType: MediaType,
    trackId: number | undefined,
    isSelected: boolean,
  ): void;
  announceVariantLockStatusChange(variantId: number | undefined): void;
  startRebuffering(): void;
  stopRebuffering(): void;
  getRandom(): number;
  sendSegmentRequestError(
    fatal: boolean,
    url: string,
    isInit: boolean,
    timeInfo: [number, number] | undefined,
    mediaType: MediaType,
    reason: RequestErrorReason,
    status: number | undefined,
  ): void;
  sendMultivariantPlaylistRequestError(
    fatal: boolean,
    url: string,
    reason: RequestErrorReason,
    status: number | undefined,
  ): void;
  sendMediaPlaylistRequestError(
    fatal: boolean,
    url: string,
    reason: RequestErrorReason,
    mediaType: MediaType | undefined,
    status: number | undefined,
  ): void;
  sendSourceBufferCreationError(
    fatal: boolean,
    code: SourceBufferCreationErrorCode,
    mediaType: MediaType,
    message: string,
  ): void;
  sendMultivariantPlaylistParsingError(
    fatal: boolean,
    code: MultivariantPlaylistParsingErrorCode,
    message: string,
  ): void;
  sendMediaPlaylistParsingError(
    fatal: boolean,
    code: MediaPlaylistParsingErrorCode,
    mediaType: MediaType | undefined,
    message: string,
  ): void;
  sendSegmentParsingError(
    fatal: boolean,
    code: SegmentParsingErrorCode,
    mediaType: MediaType | undefined,
    message: string,
  ): void;
  sendPushedSegmentError(
    fatal: boolean,
    code: PushedSegmentErrorCode,
    mediaType: MediaType,
    message: string,
  ): void;
  sendRemoveBufferError(
    fatal: boolean,
    mediaType: MediaType,
    message: string,
  ): void;
  sendOtherError(fatal: boolean, code: OtherErrorCode, message: string): void;
}

export interface WaspWasmExports {
  readonly memory: WebAssembly.Memory;
  wasp_malloc(len: number): number;
  wasp_free(ptr: number, len: number): void;
  wasp_dispatcher_new(initialBandwidth: number): number;
  wasp_dispatcher_free(ptr: number): void;
  wasp_dispatcher_load_content(
    ptr: number,
    urlPtr: number,
    urlLen: number,
    hasStartingPosition: number,
    startType: StartingPositionType,
    position: number,
  ): void;
  wasp_dispatcher_minimum_position(ptr: number): number;
  wasp_dispatcher_maximum_position(ptr: number): number;
  wasp_dispatcher_set_wanted_speed(ptr: number, speed: number): void;
  wasp_dispatcher_set_buffer_goal(ptr: number, bufferGoal: number): void;
  wasp_dispatcher_stop(ptr: number): void;
  wasp_dispatcher_lock_variant(ptr: number, variantId: number): void;
  wasp_dispatcher_unlock_variant(ptr: number): void;
  wasp_dispatcher_set_audio_track(ptr: number, trackId: number): void;
  wasp_dispatcher_set_segment_request_max_retry(
    ptr: number,
    maxRetry: number,
  ): void;
  wasp_dispatcher_set_segment_request_timeout(
    ptr: number,
    timeout: number,
  ): void;
  wasp_dispatcher_set_segment_backoff_base(ptr: number, base: number): void;
  wasp_dispatcher_set_segment_backoff_max(ptr: number, max: number): void;
  wasp_dispatcher_set_multi_variant_playlist_request_max_retry(
    ptr: number,
    maxRetry: number,
  ): void;
  wasp_dispatcher_set_multi_variant_playlist_request_timeout(
    ptr: number,
    timeout: number,
  ): void;
  wasp_dispatcher_set_multi_variant_playlist_backoff_base(
    ptr: number,
    base: number,
  ): void;
  wasp_dispatcher_set_multi_variant_playlist_backoff_max(
    ptr: number,
    max: number,
  ): void;
  wasp_dispatcher_set_media_playlist_request_max_retry(
    ptr: number,
    maxRetry: number,
  ): void;
  wasp_dispatcher_set_media_playlist_request_timeout(
    ptr: number,
    timeout: number,
  ): void;
  wasp_dispatcher_set_media_playlist_backoff_base(
    ptr: number,
    base: number,
  ): void;
  wasp_dispatcher_set_media_playlist_backoff_max(
    ptr: number,
    max: number,
  ): void;
  __web_event__request_finished(
    ptr: number,
    requestId: number,
    resourceId: number,
    resourceSize: number,
    finalUrlPtr: number,
    finalUrlLen: number,
    durationMs: number,
  ): void;
  __web_event__request_failed(
    ptr: number,
    requestId: number,
    hasTimeouted: number,
    status: number,
  ): void;
  __web_event__media_source_state_change(
    ptr: number,
    state: MediaSourceReadyState,
  ): void;
  __web_event__source_buffer_update(
    ptr: number,
    sourceBufferId: number,
    bufferedPtr: number,
    bufferedLen: number,
  ): void;
  __web_event__source_buffer_creation_error(
    ptr: number,
    sourceBufferId: number,
    code: AddSourceBufferErrorCode,
    messagePtr: number,
    messageLen: number,
  ): void;
  __web_event__append_buffer_error(
    ptr: number,
    sourceBufferId: number,
    code: PushedSegmentErrorCode,
    bufferedPtr: number,
    bufferedLen: number,
  ): void;
  __web_event__remove_buffer_error(
    ptr: number,
    sourceBufferId: number,
    bufferedPtr: number,
    bufferedLen: number,
  ): void;
  __web_event__playback_tick(
    ptr: number,
    reason: PlaybackTickReason,
    currentTime: number,
    readyState: number,
    bufferedPtr: number,
    bufferedLen: number,
    paused: number,
    seeking: number,
    ended: number,
    duration: number,
    audioPtr: number,
    audioLen: number,
    videoPtr: number,
    videoLen: number,
  ): void;
  __web_event__timer_ended(ptr: number, id: number, reason: TimerReason): void;
  __web_event__codecs_support_update(ptr: number): void;
}

export type InitInput =
  | RequestInfo
  | URL
  | Response
  | BufferSource
  | WebAssembly.Module;

export type InitOutput = WaspWasmExports;

export type InitializeWasmArg =
  | { module_or_path: InitInput | Promise<InitInput> }
  | InitInput
  | Promise<InitInput>;
