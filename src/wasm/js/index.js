// XXX TODO: split up? TypeScript?

import {
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
  PushedSegmentErrorCode,
  RemoveBufferErrorCode,
  RemoveMediaSourceErrorCode,
  RequestErrorReason,
  SegmentParsingErrorCode,
  SourceBufferCreationErrorCode,
  StartingPositionType,
  TimerReason,
} from "../../ts-common/generatedWasmEnums.js";

export {
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
  PushedSegmentErrorCode,
  RemoveBufferErrorCode,
  RemoveMediaSourceErrorCode,
  RequestErrorReason,
  SegmentParsingErrorCode,
  SourceBufferCreationErrorCode,
  StartingPositionType,
  TimerReason,
};

const textEncoder = new TextEncoder();

let wasm;
let cachedUint8Memory = null;
let cachedUint32Memory = null;
let cachedFloat64Memory = null;

function getUint8Memory() {
  const memory = wasm.memory;
  if (
    cachedUint8Memory === null ||
    cachedUint8Memory.buffer !== memory.buffer
  ) {
    cachedUint8Memory = new Uint8Array(memory.buffer);
  }
  return cachedUint8Memory;
}

function getUint32Memory() {
  const memory = wasm.memory;
  if (
    cachedUint32Memory === null ||
    cachedUint32Memory.buffer !== memory.buffer
  ) {
    cachedUint32Memory = new Uint32Array(memory.buffer);
  }
  return cachedUint32Memory;
}

function getFloat64Memory() {
  const memory = wasm.memory;
  if (
    cachedFloat64Memory === null ||
    cachedFloat64Memory.buffer !== memory.buffer
  ) {
    cachedFloat64Memory = new Float64Array(memory.buffer);
  }
  return cachedFloat64Memory;
}

function ensureBinding(name) {
  const value = globalThis[name];
  if (typeof value !== "function") {
    throw new Error(`Missing JavaScript binding: ${name}`);
  }
  return value;
}

function allocBytes(length) {
  return wasm.wasp_malloc(length);
}

function freeBytes(ptr, len) {
  if (ptr !== 0) {
    wasm.wasp_free(ptr, len);
  }
}

function writeString(str) {
  const bytes = textEncoder.encode(str);
  const ptr = allocBytes(bytes.length);
  getUint8Memory().set(bytes, ptr);
  return [ptr, bytes.length];
}

function writeOptionalString(str, ptrOut, lenOut) {
  if (str == null) {
    getUint32Memory()[ptrOut >>> 2] = 0;
    getUint32Memory()[lenOut >>> 2] = 0;
    return;
  }
  const [ptr, len] = writeString(str);
  getUint32Memory()[ptrOut >>> 2] = ptr;
  getUint32Memory()[lenOut >>> 2] = len;
}

function writeFloat64Array(values) {
  const ptr = allocBytes(values.byteLength);
  getUint8Memory().set(
    new Uint8Array(values.buffer, values.byteOffset, values.byteLength),
    ptr,
  );
  return [ptr, values.length];
}

function readString(ptr, len) {
  return new TextDecoder("utf-8", { fatal: false }).decode(
    getUint8Memory().subarray(ptr, ptr + len),
  );
}

function readOptionalF64(ptr) {
  if (ptr === 0) {
    return undefined;
  }
  return getFloat64Memory()[ptr >>> 3];
}

function withString(str, cb) {
  const [ptr, len] = writeString(str);
  try {
    return cb(ptr, len);
  } finally {
    freeBytes(ptr, len);
  }
}

function withFloat64Array(values, cb) {
  const [ptr, len] = writeFloat64Array(values);
  try {
    return cb(ptr, len);
  } finally {
    freeBytes(ptr, values.byteLength);
  }
}

function unwrapResult(
  result,
  okValue,
  errCodeOut,
  errDescPtrOut,
  errDescLenOut,
) {
  if (result.errorCode === undefined) {
    return okValue === undefined ? 1 : result.value;
  }
  getUint32Memory()[errCodeOut >>> 2] = result.errorCode;
  writeOptionalString(result.description, errDescPtrOut, errDescLenOut);
  return 0;
}

function optionalIdToRaw(value) {
  return value ?? 0xffffffff;
}

function rawOptionalId(value) {
  return value === 0xffffffff ? undefined : value;
}

class SimpleResult {
  constructor(value, errorCode, description) {
    this.value = value;
    this.errorCode = errorCode;
    this.description = description;
  }

  free() {}
}

function registerFinalizer(target, ptr, finalizer) {
  if (typeof FinalizationRegistry !== "function") {
    return;
  }
  finalizer.registry ??= new FinalizationRegistry((heldValue) =>
    finalizer.cleanup(heldValue),
  );
  finalizer.registry.register(target, ptr, target);
}

function unregisterFinalizer(target, finalizer) {
  finalizer.registry?.unregister(target);
}

export class AddSourceBufferResult extends SimpleResult {
  static success(val) {
    return new AddSourceBufferResult(val, undefined, undefined);
  }

  static error(err, desc) {
    return new AddSourceBufferResult(undefined, err, desc ?? undefined);
  }
}

export class AppendBufferResult extends SimpleResult {
  static success(start, duration) {
    return new AppendBufferResult(
      {
        start: start ?? undefined,
        duration: duration ?? undefined,
      },
      undefined,
      undefined,
    );
  }

  static error(err, desc) {
    return new AppendBufferResult(undefined, err, desc ?? undefined);
  }
}

export class AttachMediaSourceResult extends SimpleResult {
  static success() {
    return new AttachMediaSourceResult(true, undefined, undefined);
  }

  static error(err, desc) {
    return new AttachMediaSourceResult(undefined, err, desc ?? undefined);
  }
}

export class EndOfStreamResult extends SimpleResult {
  static success() {
    return new EndOfStreamResult(true, undefined, undefined);
  }

  static error(err, desc) {
    return new EndOfStreamResult(undefined, err, desc ?? undefined);
  }
}

export class MediaSourceDurationUpdateResult extends SimpleResult {
  static success() {
    return new MediaSourceDurationUpdateResult(true, undefined, undefined);
  }

  static error(err, desc) {
    return new MediaSourceDurationUpdateResult(
      undefined,
      err,
      desc ?? undefined,
    );
  }
}

export class RemoveBufferResult extends SimpleResult {
  static success() {
    return new RemoveBufferResult(true, undefined, undefined);
  }

  static error(err, desc) {
    return new RemoveBufferResult(undefined, err, desc ?? undefined);
  }
}

export class RemoveMediaSourceResult extends SimpleResult {
  static success() {
    return new RemoveMediaSourceResult(true, undefined, undefined);
  }

  static error(err, desc) {
    return new RemoveMediaSourceResult(undefined, err, desc ?? undefined);
  }
}

export class JsTimeRanges {
  constructor(buffered) {
    this.buffered = buffered;
  }

  free() {}

  len() {
    return this.buffered.length / 2;
  }

  start(idx) {
    return this.buffered[idx * 2];
  }

  end(idx) {
    return this.buffered[idx * 2 + 1];
  }

  start_unchecked(idx) {
    return this.start(idx);
  }

  end_unchecked(idx) {
    return this.end(idx);
  }
}

export class MediaObservation {
  constructor(
    reason,
    current_time,
    ready_state,
    buffered,
    paused,
    seeking,
    ended,
    duration,
    audio_buffered,
    video_buffered,
  ) {
    this.reason = reason;
    this.current_time = current_time;
    this.ready_state = ready_state;
    this.buffered = buffered;
    this.paused = paused;
    this.seeking = seeking;
    this.ended = ended;
    this.duration = duration;
    this.audio_buffered = audio_buffered ?? undefined;
    this.video_buffered = video_buffered ?? undefined;
  }

  free() {}
}

export class StartingPosition {
  constructor(start_type, position) {
    this.start_type = start_type;
    this.position = position;
  }

  free() {}
}

const dispatcherFinalizer = {
  cleanup(ptr) {
    wasm?.wasp_dispatcher_free(ptr);
  },
};

export class Dispatcher {
  constructor(initial_bandwidth) {
    this.__ptr = wasm.wasp_dispatcher_new(initial_bandwidth);
    registerFinalizer(this, this.__ptr, dispatcherFinalizer);
  }

  free() {
    if (this.__ptr !== 0) {
      unregisterFinalizer(this, dispatcherFinalizer);
      wasm.wasp_dispatcher_free(this.__ptr);
      this.__ptr = 0;
    }
  }

  load_content(content_url, starting_pos) {
    withString(content_url, (ptr, len) => {
      wasm.wasp_dispatcher_load_content(
        this.__ptr,
        ptr,
        len,
        starting_pos == null ? 0 : 1,
        starting_pos?.start_type ?? 0,
        starting_pos?.position ?? 0,
      );
    });
  }

  minimum_position() {
    const value = wasm.wasp_dispatcher_minimum_position(this.__ptr);
    return Number.isNaN(value) ? undefined : value;
  }

  maximum_position() {
    const value = wasm.wasp_dispatcher_maximum_position(this.__ptr);
    return Number.isNaN(value) ? undefined : value;
  }

  set_wanted_speed(speed) {
    wasm.wasp_dispatcher_set_wanted_speed(this.__ptr, speed);
  }

  set_buffer_goal(buffer_goal) {
    wasm.wasp_dispatcher_set_buffer_goal(this.__ptr, buffer_goal);
  }

  stop() {
    wasm.wasp_dispatcher_stop(this.__ptr);
  }

  lock_variant(variant_id) {
    wasm.wasp_dispatcher_lock_variant(this.__ptr, variant_id);
  }

  unlock_variant() {
    wasm.wasp_dispatcher_unlock_variant(this.__ptr);
  }

  set_audio_track(track_id) {
    wasm.wasp_dispatcher_set_audio_track(this.__ptr, optionalIdToRaw(track_id));
  }

  set_segment_request_max_retry(max_retry) {
    wasm.wasp_dispatcher_set_segment_request_max_retry(this.__ptr, max_retry);
  }

  set_segment_request_timeout(timeout) {
    wasm.wasp_dispatcher_set_segment_request_timeout(this.__ptr, timeout);
  }

  set_segment_backoff_base(base) {
    wasm.wasp_dispatcher_set_segment_backoff_base(this.__ptr, base);
  }

  set_segment_backoff_max(max) {
    wasm.wasp_dispatcher_set_segment_backoff_max(this.__ptr, max);
  }

  set_multi_variant_playlist_request_max_retry(max_retry) {
    wasm.wasp_dispatcher_set_multi_variant_playlist_request_max_retry(
      this.__ptr,
      max_retry,
    );
  }

  set_multi_variant_playlist_request_timeout(timeout) {
    wasm.wasp_dispatcher_set_multi_variant_playlist_request_timeout(
      this.__ptr,
      timeout,
    );
  }

  set_multi_variant_playlist_backoff_base(base) {
    wasm.wasp_dispatcher_set_multi_variant_playlist_backoff_base(
      this.__ptr,
      base,
    );
  }

  set_multi_variant_playlist_backoff_max(max) {
    wasm.wasp_dispatcher_set_multi_variant_playlist_backoff_max(
      this.__ptr,
      max,
    );
  }

  set_media_playlist_request_max_retry(max_retry) {
    wasm.wasp_dispatcher_set_media_playlist_request_max_retry(
      this.__ptr,
      max_retry,
    );
  }

  set_media_playlist_request_timeout(timeout) {
    wasm.wasp_dispatcher_set_media_playlist_request_timeout(
      this.__ptr,
      timeout,
    );
  }

  set_media_playlist_backoff_base(base) {
    wasm.wasp_dispatcher_set_media_playlist_backoff_base(this.__ptr, base);
  }

  set_media_playlist_backoff_max(max) {
    wasm.wasp_dispatcher_set_media_playlist_backoff_max(this.__ptr, max);
  }

  on_request_finished(
    request_id,
    resource_id,
    resource_size,
    final_url,
    duration_ms,
  ) {
    withString(final_url, (ptr, len) => {
      wasm.__web_event__request_finished(
        this.__ptr,
        request_id,
        resource_id,
        resource_size,
        ptr,
        len,
        duration_ms,
      );
    });
  }

  on_request_failed(request_id, has_timeouted, status) {
    wasm.__web_event__request_failed(
      this.__ptr,
      request_id,
      has_timeouted ? 1 : 0,
      optionalIdToRaw(status),
    );
  }

  on_media_source_state_change(state) {
    wasm.__web_event__media_source_state_change(this.__ptr, state);
  }

  on_source_buffer_update(source_buffer_id, buffered) {
    withFloat64Array(buffered.buffered, (ptr, len) => {
      wasm.__web_event__source_buffer_update(
        this.__ptr,
        source_buffer_id,
        ptr,
        len,
      );
    });
  }

  on_source_buffer_creation_error(source_buffer_id, code, msg) {
    withString(msg, (ptr, len) => {
      wasm.__web_event__source_buffer_creation_error(
        this.__ptr,
        source_buffer_id,
        code,
        ptr,
        len,
      );
    });
  }

  on_append_buffer_error(source_buffer_id, code, buffered) {
    withFloat64Array(buffered.buffered, (ptr, len) => {
      wasm.__web_event__append_buffer_error(
        this.__ptr,
        source_buffer_id,
        code,
        ptr,
        len,
      );
    });
  }

  on_remove_buffer_error(source_buffer_id, buffered) {
    withFloat64Array(buffered.buffered, (ptr, len) => {
      wasm.__web_event__remove_buffer_error(
        this.__ptr,
        source_buffer_id,
        ptr,
        len,
      );
    });
  }

  on_playback_tick(observation) {
    withFloat64Array(
      observation.buffered.buffered,
      (bufferedPtr, bufferedLen) => {
        const audioBuffered = observation.audio_buffered?.buffered;
        const videoBuffered = observation.video_buffered?.buffered;
        const invoke = (audioPtr, audioLen, videoPtr, videoLen) =>
          wasm.__web_event__playback_tick(
            this.__ptr,
            observation.reason,
            observation.current_time,
            observation.ready_state,
            bufferedPtr,
            bufferedLen,
            observation.paused ? 1 : 0,
            observation.seeking ? 1 : 0,
            observation.ended ? 1 : 0,
            observation.duration,
            audioPtr,
            audioLen,
            videoPtr,
            videoLen,
          );
        if (audioBuffered != null) {
          return withFloat64Array(audioBuffered, (audioPtr, audioLen) => {
            if (videoBuffered != null) {
              return withFloat64Array(videoBuffered, (videoPtr, videoLen) =>
                invoke(audioPtr, audioLen, videoPtr, videoLen),
              );
            }
            return invoke(audioPtr, audioLen, 0, 0xffffffff);
          });
        }
        if (videoBuffered != null) {
          return withFloat64Array(videoBuffered, (videoPtr, videoLen) =>
            invoke(0, 0xffffffff, videoPtr, videoLen),
          );
        }
        return invoke(0, 0xffffffff, 0, 0xffffffff);
      },
    );
  }

  on_timer_ended(id, reason) {
    wasm.__web_event__timer_ended(this.__ptr, id, reason);
  }

  on_codecs_support_update() {
    wasm.__web_event__codecs_support_update(this.__ptr);
  }
}

function getImports() {
  return {
    wasp: {
      __js_func__log(logLevel, ptr, len) {
        ensureBinding("jsLog")(logLevel, readString(ptr, len));
      },
      __js_func__timer(duration, reason) {
        return ensureBinding("jsTimer")(duration, reason);
      },
      __js_func__clear_timer(id) {
        ensureBinding("jsClearTimer")(id);
      },
      __js_func__get_resource_len(id) {
        const data = ensureBinding("jsGetResourceData")(id);
        return data == null ? -1 : data.byteLength;
      },
      __js_func__copy_resource_data(id, destPtr, destLen) {
        const data = ensureBinding("jsGetResourceData")(id);
        if (data == null) {
          return 0;
        }
        getUint8Memory().set(data.subarray(0, destLen), destPtr);
        return 1;
      },
      __js_func__fetch(
        urlPtr,
        urlLen,
        hasRangeBase,
        rangeBase,
        hasRangeEnd,
        rangeEnd,
        timeout,
      ) {
        return ensureBinding("jsFetch")(
          readString(urlPtr, urlLen),
          hasRangeBase !== 0 ? rangeBase : undefined,
          hasRangeEnd !== 0 ? rangeEnd : undefined,
          timeout,
        );
      },
      __js_func__abort_request(requestId) {
        return ensureBinding("jsAbortRequest")(requestId) ? 1 : 0;
      },
      __js_func__attach_media_source(errCodeOut, errDescPtrOut, errDescLenOut) {
        return unwrapResult(
          ensureBinding("jsAttachMediaSource")(),
          1,
          errCodeOut,
          errDescPtrOut,
          errDescLenOut,
        );
      },
      __js_func__remove_media_source(errCodeOut, errDescPtrOut, errDescLenOut) {
        return unwrapResult(
          ensureBinding("jsRemoveMediaSource")(),
          1,
          errCodeOut,
          errDescPtrOut,
          errDescLenOut,
        );
      },
      __js_func__set_media_source_duration(
        duration,
        errCodeOut,
        errDescPtrOut,
        errDescLenOut,
      ) {
        return unwrapResult(
          ensureBinding("jsSetMediaSourceDuration")(duration),
          1,
          errCodeOut,
          errDescPtrOut,
          errDescLenOut,
        );
      },
      __js_func__add_source_buffer(
        mediaType,
        typPtr,
        typLen,
        sourceBufferIdOut,
        errCodeOut,
        errDescPtrOut,
        errDescLenOut,
      ) {
        const result = ensureBinding("jsAddSourceBuffer")(
          mediaType,
          readString(typPtr, typLen),
        );
        if (result.errorCode === undefined) {
          getUint32Memory()[sourceBufferIdOut >>> 2] = result.value;
          return 1;
        }
        getUint32Memory()[errCodeOut >>> 2] = result.errorCode;
        writeOptionalString(result.description, errDescPtrOut, errDescLenOut);
        return 0;
      },
      __js_func__is_type_supported(mediaType, typPtr, typLen) {
        const value = ensureBinding("jsIsTypeSupported")(
          mediaType,
          readString(typPtr, typLen),
        );
        return value === undefined ? -1 : value ? 1 : 0;
      },
      __js_func__append_buffer(
        sourceBufferId,
        resourceId,
        parseTimeInformation,
        hasStartOut,
        startOut,
        hasDurationOut,
        durationOut,
        errCodeOut,
        errDescPtrOut,
        errDescLenOut,
      ) {
        const result = ensureBinding("jsAppendBuffer")(
          sourceBufferId,
          resourceId,
          parseTimeInformation !== 0,
        );
        if (result.errorCode !== undefined) {
          getUint32Memory()[errCodeOut >>> 2] = result.errorCode;
          writeOptionalString(result.description, errDescPtrOut, errDescLenOut);
          return 0;
        }
        const parsed = result.value;
        getUint32Memory()[hasStartOut >>> 2] = parsed?.start == null ? 0 : 1;
        getFloat64Memory()[startOut >>> 3] = parsed?.start ?? 0;
        getUint32Memory()[hasDurationOut >>> 2] =
          parsed?.duration == null ? 0 : 1;
        getFloat64Memory()[durationOut >>> 3] = parsed?.duration ?? 0;
        return 1;
      },
      __js_func__remove_buffer(
        sourceBufferId,
        start,
        end,
        errCodeOut,
        errDescPtrOut,
        errDescLenOut,
      ) {
        return unwrapResult(
          ensureBinding("jsRemoveBuffer")(sourceBufferId, start, end),
          1,
          errCodeOut,
          errDescPtrOut,
          errDescLenOut,
        );
      },
      __js_func__end_of_stream(errCodeOut, errDescPtrOut, errDescLenOut) {
        return unwrapResult(
          ensureBinding("jsEndOfStream")(),
          1,
          errCodeOut,
          errDescPtrOut,
          errDescLenOut,
        );
      },
      __js_func__start_observing_playback() {
        ensureBinding("jsStartObservingPlayback")();
      },
      __js_func__stop_observing_playback() {
        ensureBinding("jsStopObservingPlayback")();
      },
      __js_func__free_resource(resourceId) {
        return ensureBinding("jsFreeResource")(resourceId) ? 1 : 0;
      },
      __js_func__set_playback_rate(playbackRate) {
        ensureBinding("jsSetPlaybackRate")(playbackRate);
      },
      __js_func__seek(position) {
        ensureBinding("jsSeek")(position);
      },
      __js_func__flush() {
        ensureBinding("jsFlush")();
      },
      __js_func__set_media_offset(mediaOffset) {
        ensureBinding("jsSetMediaOffset")(mediaOffset);
      },
      __js_func__update_content_info(hasMin, min, hasMax, max, playlistNat) {
        ensureBinding("jsUpdateContentInfo")(
          hasMin !== 0 ? min : undefined,
          hasMax !== 0 ? max : undefined,
          playlistNat,
        );
      },
      __js_func__announce_fetched_content(
        variantInfoPtr,
        variantInfoLen,
        audioTracksInfoPtr,
        audioTracksInfoLen,
      ) {
        ensureBinding("jsAnnounceFetchedContent")(
          new Uint32Array(wasm.memory.buffer, variantInfoPtr, variantInfoLen),
          new Uint32Array(
            wasm.memory.buffer,
            audioTracksInfoPtr,
            audioTracksInfoLen,
          ),
        );
      },
      __js_func__announce_variant_update(variantId) {
        ensureBinding("jsAnnounceVariantUpdate")(rawOptionalId(variantId));
      },
      __js_func__announce_track_update(mediaType, trackId, isSelected) {
        ensureBinding("jsAnnounceTrackUpdate")(
          mediaType,
          rawOptionalId(trackId),
          isSelected !== 0,
        );
      },
      __js_func__announce_variant_lock_status_change(variantId) {
        ensureBinding("jsAnnounceVariantLockStatusChange")(
          rawOptionalId(variantId),
        );
      },
      __js_func__start_rebuffering() {
        ensureBinding("jsStartRebuffering")();
      },
      __js_func__stop_rebuffering() {
        ensureBinding("jsStopRebuffering")();
      },
      __js_func__get_random() {
        return ensureBinding("jsGetRandom")();
      },
      __js_func__send_segment_request_error(
        fatal,
        urlPtr,
        urlLen,
        isInit,
        mediaType,
        startPtr,
        durationPtr,
        reason,
        status,
      ) {
        ensureBinding("jsSendSegmentRequestError")(
          fatal !== 0,
          readString(urlPtr, urlLen),
          isInit !== 0,
          readOptionalF64(startPtr) === undefined ||
            readOptionalF64(durationPtr) === undefined
            ? undefined
            : [readOptionalF64(startPtr), readOptionalF64(durationPtr)],
          mediaType,
          reason,
          rawOptionalId(status),
        );
      },
      __js_func__send_multivariant_playlist_request_error(
        fatal,
        urlPtr,
        urlLen,
        reason,
        status,
      ) {
        ensureBinding("jsSendMultivariantPlaylistRequestError")(
          fatal !== 0,
          readString(urlPtr, urlLen),
          reason,
          rawOptionalId(status),
        );
      },
      __js_func__send_media_playlist_request_error(
        fatal,
        urlPtr,
        urlLen,
        reason,
        mediaType,
        status,
      ) {
        ensureBinding("jsSendMediaPlaylistRequestError")(
          fatal !== 0,
          readString(urlPtr, urlLen),
          reason,
          rawOptionalId(mediaType),
          rawOptionalId(status),
        );
      },
      __js_func__send_source_buffer_creation_error(
        fatal,
        code,
        mediaType,
        messagePtr,
        messageLen,
      ) {
        ensureBinding("jsSendSourceBufferCreationError")(
          fatal !== 0,
          code,
          mediaType,
          readString(messagePtr, messageLen),
        );
      },
      __js_func__send_multivariant_playlist_parsing_error(
        fatal,
        code,
        messagePtr,
        messageLen,
      ) {
        ensureBinding("jsSendMultivariantPlaylistParsingError")(
          fatal !== 0,
          code,
          readString(messagePtr, messageLen),
        );
      },
      __js_func__send_media_playlist_parsing_error(
        fatal,
        code,
        mediaType,
        messagePtr,
        messageLen,
      ) {
        ensureBinding("jsSendMediaPlaylistParsingError")(
          fatal !== 0,
          code,
          mediaType,
          readString(messagePtr, messageLen),
        );
      },
      __js_func__send_segment_parsing_error(
        fatal,
        code,
        mediaType,
        messagePtr,
        messageLen,
      ) {
        ensureBinding("jsSendSegmentParsingError")(
          fatal !== 0,
          code,
          mediaType,
          readString(messagePtr, messageLen),
        );
      },
      __js_func__send_pushed_segment_error(
        fatal,
        code,
        mediaType,
        messagePtr,
        messageLen,
      ) {
        ensureBinding("jsSendPushedSegmentError")(
          fatal !== 0,
          code,
          mediaType,
          readString(messagePtr, messageLen),
        );
      },
      __js_func__send_remove_buffer_error(
        fatal,
        mediaType,
        messagePtr,
        messageLen,
      ) {
        ensureBinding("jsSendRemoveBufferError")(
          fatal !== 0,
          mediaType,
          readString(messagePtr, messageLen),
        );
      },
      __js_func__send_other_error(fatal, code, messagePtr, messageLen) {
        ensureBinding("jsSendOtherError")(
          fatal !== 0,
          code,
          readString(messagePtr, messageLen),
        );
      },
    },
  };
}

function normalizeInitInput(input) {
  if (input && typeof input === "object" && "module_or_path" in input) {
    return input.module_or_path;
  }
  return input;
}

async function instantiate(input) {
  const imports = getImports();
  if (input instanceof WebAssembly.Module) {
    return WebAssembly.instantiate(input, imports);
  }
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    return WebAssembly.instantiate(input, imports);
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
  if (awaited instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(awaited.clone(), imports);
      } catch (_) {
        return WebAssembly.instantiate(await awaited.arrayBuffer(), imports);
      }
    }
    return WebAssembly.instantiate(await awaited.arrayBuffer(), imports);
  }
  return WebAssembly.instantiate(awaited, imports);
}

export function initSync(module) {
  const imports = getImports();
  const instance =
    module instanceof WebAssembly.Instance
      ? module
      : new WebAssembly.Instance(module, imports);
  wasm = instance.exports;
  cachedUint8Memory = null;
  cachedUint32Memory = null;
  cachedFloat64Memory = null;
  return wasm;
}

export default async function initializeWasm(module_or_path) {
  const normalized = normalizeInitInput(module_or_path);
  const result = await instantiate(normalized);
  wasm = result.instance.exports;
  cachedUint8Memory = null;
  cachedUint32Memory = null;
  cachedFloat64Memory = null;
  return wasm;
}
