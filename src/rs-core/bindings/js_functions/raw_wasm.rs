#![allow(non_snake_case)]

use super::{RequestId, ResourceId, SourceBufferId, TimerId};

#[allow(clippy::too_many_arguments)]
#[link(wasm_import_module = "wasp")]
unsafe extern "C" {
    pub(super) fn __js_func__log(log_level: u32, ptr: *const u8, len: u32);
    pub(super) fn __js_func__timer(duration: f64, reason: u32) -> TimerId;
    pub(super) fn __js_func__clear_timer(id: TimerId);
    pub(super) fn __js_func__get_resource_len(id: ResourceId) -> i32;
    pub(super) fn __js_func__copy_resource_data(
        id: ResourceId,
        dest_ptr: *mut u8,
        dest_len: u32,
    ) -> u32;
    pub(super) fn __js_func__fetch(
        url_ptr: *const u8,
        url_len: u32,
        has_range_base: u32,
        range_base: usize,
        has_range_end: u32,
        range_end: usize,
        timeout: f64,
    ) -> RequestId;
    pub(super) fn __js_func__abort_request(request_id: RequestId) -> u32;
    pub(super) fn __js_func__attach_media_source(
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    pub(super) fn __js_func__remove_media_source(
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    pub(super) fn __js_func__set_media_source_duration(
        duration: f64,
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    pub(super) fn __js_func__add_source_buffer(
        media_type: u32,
        typ_ptr: *const u8,
        typ_len: u32,
        source_buffer_id_out: *mut u32,
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    pub(super) fn __js_func__is_type_supported(
        media_type: u32,
        typ_ptr: *const u8,
        typ_len: u32,
    ) -> i32;
    pub(super) fn __js_func__inspect_segment(
        segment_id: ResourceId,
        media_type_out: *mut u32,
        parsed_mime_type_ptr_out: *mut u32,
        parsed_mime_type_len_out: *mut u32,
        codec_ptr_out: *mut u32,
        codec_len_out: *mut u32,
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    pub(super) fn __js_func__append_buffer(
        source_buffer_id: SourceBufferId,
        segment_id: ResourceId,
        base_decode_time_start_hi: u32,
        base_decode_time_start_lo: u32,
        base_decode_time_start_timescale: u32,
        reset_transmuxer_state: u32,
        has_start_out: *mut u32,
        start_value_hi_out: *mut u32,
        start_value_lo_out: *mut u32,
        has_end_out: *mut u32,
        end_value_hi_out: *mut u32,
        end_value_lo_out: *mut u32,
        timescale: *mut u32,
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    pub(super) fn __js_func__remove_buffer(
        source_buffer_id: SourceBufferId,
        start: f64,
        end: f64,
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    pub(super) fn __js_func__end_of_stream(
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    pub(super) fn __js_func__start_observing_playback();
    pub(super) fn __js_func__stop_observing_playback();
    pub(super) fn __js_func__free_resource(resource_id: ResourceId) -> u32;
    pub(super) fn __js_func__set_playback_rate(playback_rate: f64);
    pub(super) fn __js_func__seek(position: f64);
    pub(super) fn __js_func__flush();
    pub(super) fn __js_func__set_media_offset(media_offset: f64);
    pub(super) fn __js_func__update_content_info(
        has_minimum_position: u32,
        minimum_position: f64,
        has_maximum_position: u32,
        maximum_position: f64,
        playlist_nat: u32,
    );
    pub(super) fn __js_func__announce_fetched_content(
        playlist_type: u32,
        variant_info_ptr: *const u32,
        variant_info_len: u32,
        audio_tracks_info_ptr: *const u32,
        audio_tracks_info_len: u32,
    );
    pub(super) fn __js_func__announce_variant_update(variant_id: u32);
    pub(super) fn __js_func__announce_track_update(
        media_type: u32,
        track_id: u32,
        is_selected: u32,
    );
    pub(super) fn __js_func__announce_variant_lock_status_change(variant_id: u32);
    pub(super) fn __js_func__start_rebuffering();
    pub(super) fn __js_func__stop_rebuffering();
    pub(super) fn __js_func__get_random() -> f64;
    pub(super) fn __js_func__send_segment_request_error(
        fatal: u32,
        url_ptr: *const u8,
        url_len: u32,
        is_init: u32,
        media_type: u32,
        start_ptr: *const f64,
        duration_ptr: *const f64,
        reason: u32,
        status: u32,
    );
    pub(super) fn __js_func__send_multivariant_playlist_request_error(
        fatal: u32,
        url_ptr: *const u8,
        url_len: u32,
        reason: u32,
        status: u32,
    );
    pub(super) fn __js_func__send_media_playlist_request_error(
        fatal: u32,
        url_ptr: *const u8,
        url_len: u32,
        reason: u32,
        media_type: u32,
        status: u32,
    );
    pub(super) fn __js_func__send_source_buffer_creation_error(
        fatal: u32,
        code: u32,
        media_type: u32,
        message_ptr: *const u8,
        message_len: u32,
    );
    pub(super) fn __js_func__send_multivariant_playlist_parsing_error(
        fatal: u32,
        code: u32,
        message_ptr: *const u8,
        message_len: u32,
    );
    pub(super) fn __js_func__send_media_playlist_parsing_error(
        fatal: u32,
        code: u32,
        media_type: u32,
        message_ptr: *const u8,
        message_len: u32,
    );
    pub(super) fn __js_func__send_segment_parsing_error(
        fatal: u32,
        code: u32,
        media_type: u32,
        message_ptr: *const u8,
        message_len: u32,
    );
    pub(super) fn __js_func__send_pushed_segment_error(
        fatal: u32,
        code: u32,
        media_type: u32,
        message_ptr: *const u8,
        message_len: u32,
    );
    pub(super) fn __js_func__send_remove_buffer_error(
        fatal: u32,
        media_type: u32,
        message_ptr: *const u8,
        message_len: u32,
    );
    pub(super) fn __js_func__send_other_error(
        fatal: u32,
        code: u32,
        message_ptr: *const u8,
        message_len: u32,
    );
}
