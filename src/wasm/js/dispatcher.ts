import {
  registerFinalizer,
  unregisterFinalizer,
  FinalizerState,
} from "./finalization_registry.js";
import { getWasmExports, withFloat64Array, withString } from "./memory.js";
import { optionalIdToRaw } from "./helpers.js";
import type {
  AddSourceBufferErrorCode,
  MediaSourceReadyState,
  PushedSegmentErrorCode,
  TimerReason,
} from "./enums.js";
import { JsTimeRanges, MediaObservation, StartingPosition } from "./results.js";

export class Dispatcher {
  private __ptr: number;
  private __finalizer: FinalizerState;

  constructor(initial_bandwidth: number) {
    this.__ptr = getWasmExports().wasp_dispatcher_new(initial_bandwidth);
    this.__finalizer = {
      cleanup(ptr) {
        getWasmExports().wasp_dispatcher_free(ptr);
      },
    };
    registerFinalizer(this, this.__ptr, this.__finalizer);
  }

  public free(): void {
    if (this.__ptr !== 0) {
      unregisterFinalizer(this, this.__finalizer);
      getWasmExports().wasp_dispatcher_free(this.__ptr);
      this.__ptr = 0;
    }
  }

  public load_content(
    content_url: string,
    starting_pos?: StartingPosition | null,
  ): void {
    withString(content_url, (ptr, len) => {
      getWasmExports().wasp_dispatcher_load_content(
        this.__ptr,
        ptr,
        len,
        starting_pos == null ? 0 : 1,
        starting_pos?.start_type ?? 0,
        starting_pos?.position ?? 0,
      );
    });
  }

  public minimum_position(): number | undefined {
    const value = getWasmExports().wasp_dispatcher_minimum_position(this.__ptr);
    return Number.isNaN(value) ? undefined : value;
  }

  public maximum_position(): number | undefined {
    const value = getWasmExports().wasp_dispatcher_maximum_position(this.__ptr);
    return Number.isNaN(value) ? undefined : value;
  }

  public set_wanted_speed(speed: number): void {
    getWasmExports().wasp_dispatcher_set_wanted_speed(this.__ptr, speed);
  }

  public set_buffer_goal(buffer_goal: number): void {
    getWasmExports().wasp_dispatcher_set_buffer_goal(this.__ptr, buffer_goal);
  }

  public stop(): void {
    getWasmExports().wasp_dispatcher_stop(this.__ptr);
  }

  public lock_variant(variant_id: number): void {
    getWasmExports().wasp_dispatcher_lock_variant(this.__ptr, variant_id);
  }

  public unlock_variant(): void {
    getWasmExports().wasp_dispatcher_unlock_variant(this.__ptr);
  }

  public set_audio_track(track_id?: number | null): void {
    getWasmExports().wasp_dispatcher_set_audio_track(
      this.__ptr,
      optionalIdToRaw(track_id ?? undefined),
    );
  }

  public set_segment_request_max_retry(max_retry: number): void {
    getWasmExports().wasp_dispatcher_set_segment_request_max_retry(
      this.__ptr,
      max_retry,
    );
  }

  public set_segment_request_timeout(timeout: number): void {
    getWasmExports().wasp_dispatcher_set_segment_request_timeout(
      this.__ptr,
      timeout,
    );
  }

  public set_segment_backoff_base(base: number): void {
    getWasmExports().wasp_dispatcher_set_segment_backoff_base(this.__ptr, base);
  }

  public set_segment_backoff_max(max: number): void {
    getWasmExports().wasp_dispatcher_set_segment_backoff_max(this.__ptr, max);
  }

  public set_multi_variant_playlist_request_max_retry(max_retry: number): void {
    getWasmExports().wasp_dispatcher_set_multi_variant_playlist_request_max_retry(
      this.__ptr,
      max_retry,
    );
  }

  public set_multi_variant_playlist_request_timeout(timeout: number): void {
    getWasmExports().wasp_dispatcher_set_multi_variant_playlist_request_timeout(
      this.__ptr,
      timeout,
    );
  }

  public set_multi_variant_playlist_backoff_base(base: number): void {
    getWasmExports().wasp_dispatcher_set_multi_variant_playlist_backoff_base(
      this.__ptr,
      base,
    );
  }

  public set_multi_variant_playlist_backoff_max(max: number): void {
    getWasmExports().wasp_dispatcher_set_multi_variant_playlist_backoff_max(
      this.__ptr,
      max,
    );
  }

  public set_media_playlist_request_max_retry(max_retry: number): void {
    getWasmExports().wasp_dispatcher_set_media_playlist_request_max_retry(
      this.__ptr,
      max_retry,
    );
  }

  public set_media_playlist_request_timeout(timeout: number): void {
    getWasmExports().wasp_dispatcher_set_media_playlist_request_timeout(
      this.__ptr,
      timeout,
    );
  }

  public set_media_playlist_backoff_base(base: number): void {
    getWasmExports().wasp_dispatcher_set_media_playlist_backoff_base(
      this.__ptr,
      base,
    );
  }

  public set_media_playlist_backoff_max(max: number): void {
    getWasmExports().wasp_dispatcher_set_media_playlist_backoff_max(
      this.__ptr,
      max,
    );
  }

  public on_request_finished(
    request_id: number,
    resource_id: number,
    resource_size: number,
    final_url: string,
    duration_ms: number,
  ): void {
    withString(final_url, (ptr, len) => {
      getWasmExports().__web_event__request_finished(
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

  public on_request_failed(
    request_id: number,
    has_timeouted: boolean,
    status?: number | null,
  ): void {
    getWasmExports().__web_event__request_failed(
      this.__ptr,
      request_id,
      has_timeouted ? 1 : 0,
      optionalIdToRaw(status ?? undefined),
    );
  }

  public on_media_source_state_change(state: MediaSourceReadyState): void {
    getWasmExports().__web_event__media_source_state_change(this.__ptr, state);
  }

  public on_source_buffer_update(
    source_buffer_id: number,
    buffered: JsTimeRanges,
  ): void {
    withFloat64Array(buffered.buffered, (ptr, len) => {
      getWasmExports().__web_event__source_buffer_update(
        this.__ptr,
        source_buffer_id,
        ptr,
        len,
      );
    });
  }

  public on_source_buffer_creation_error(
    source_buffer_id: number,
    code: AddSourceBufferErrorCode,
    msg: string,
  ): void {
    withString(msg, (ptr, len) => {
      getWasmExports().__web_event__source_buffer_creation_error(
        this.__ptr,
        source_buffer_id,
        code,
        ptr,
        len,
      );
    });
  }

  public on_append_buffer_error(
    source_buffer_id: number,
    code: PushedSegmentErrorCode,
    buffered: JsTimeRanges,
  ): void {
    withFloat64Array(buffered.buffered, (ptr, len) => {
      getWasmExports().__web_event__append_buffer_error(
        this.__ptr,
        source_buffer_id,
        code,
        ptr,
        len,
      );
    });
  }

  public on_remove_buffer_error(
    source_buffer_id: number,
    buffered: JsTimeRanges,
  ): void {
    withFloat64Array(buffered.buffered, (ptr, len) => {
      getWasmExports().__web_event__remove_buffer_error(
        this.__ptr,
        source_buffer_id,
        ptr,
        len,
      );
    });
  }

  public on_playback_tick(observation: MediaObservation): void {
    withFloat64Array(
      observation.buffered.buffered,
      (bufferedPtr, bufferedLen) => {
        const audioBuffered = observation.audio_buffered?.buffered;
        const videoBuffered = observation.video_buffered?.buffered;
        const invoke = (
          audioPtr: number,
          audioLen: number,
          videoPtr: number,
          videoLen: number,
        ) =>
          getWasmExports().__web_event__playback_tick(
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

  public on_timer_ended(id: number, reason: TimerReason): void {
    getWasmExports().__web_event__timer_ended(this.__ptr, id, reason);
  }

  public on_codecs_support_update(): void {
    getWasmExports().__web_event__codecs_support_update(this.__ptr);
  }
}
