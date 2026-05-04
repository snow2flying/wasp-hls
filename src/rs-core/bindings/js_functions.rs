#![allow(non_snake_case)]

use super::{
    AddSourceBufferErrorCode, AttachMediaSourceErrorCode, EndOfStreamErrorCode, LogLevel,
    MediaPlaylistParsingErrorCode, MediaSourceDurationUpdateErrorCode, MediaType,
    MultivariantPlaylistParsingErrorCode, OtherErrorCode, PlaylistNature, PushedSegmentErrorCode,
    RemoveBufferErrorCode, RemoveMediaSourceErrorCode, RequestErrorReason, SegmentParsingErrorCode,
    SourceBufferCreationErrorCode, TimerReason,
};
use crate::{
    media_element::PushSegmentError,
    parser::{
        MediaPlaylistParsingError, MediaPlaylistUpdateError, MultivariantPlaylistParsingError,
    },
};
use std::{fmt, slice};

// XXX TODO: COMMENTS HAVE BEEN REMOVED, DRAMATIC!!!!!!!

// This file lists all JavaScript functions that are callable from Rust as well as
// structs and enumerations used by those functions.

#[link(wasm_import_module = "wasp")]
unsafe extern "C" {
    fn __js_func__log(log_level: u32, ptr: *const u8, len: u32);
    fn __js_func__timer(duration: f64, reason: u32) -> TimerId;
    fn __js_func__clear_timer(id: TimerId);
    fn __js_func__get_resource_len(id: ResourceId) -> i32;
    fn __js_func__copy_resource_data(id: ResourceId, dest_ptr: *mut u8, dest_len: u32) -> u32;
    fn __js_func__fetch(
        url_ptr: *const u8,
        url_len: u32,
        has_range_base: u32,
        range_base: usize,
        has_range_end: u32,
        range_end: usize,
        timeout: f64,
    ) -> RequestId;
    fn __js_func__abort_request(request_id: RequestId) -> u32;
    fn __js_func__attach_media_source(
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    fn __js_func__remove_media_source(
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    fn __js_func__set_media_source_duration(
        duration: f64,
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    fn __js_func__add_source_buffer(
        media_type: u32,
        typ_ptr: *const u8,
        typ_len: u32,
        source_buffer_id_out: *mut u32,
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    fn __js_func__is_type_supported(media_type: u32, typ_ptr: *const u8, typ_len: u32) -> i32;
    fn __js_func__append_buffer(
        source_buffer_id: SourceBufferId,
        segment_id: ResourceId,
        parse_time_information: u32,
        has_start_out: *mut u32,
        start_out: *mut f64,
        has_duration_out: *mut u32,
        duration_out: *mut f64,
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    fn __js_func__remove_buffer(
        source_buffer_id: SourceBufferId,
        start: f64,
        end: f64,
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    fn __js_func__end_of_stream(
        err_code_out: *mut u32,
        err_desc_ptr_out: *mut u32,
        err_desc_len_out: *mut u32,
    ) -> u32;
    fn __js_func__start_observing_playback();
    fn __js_func__stop_observing_playback();
    fn __js_func__free_resource(resource_id: ResourceId) -> u32;
    fn __js_func__set_playback_rate(playback_rate: f64);
    fn __js_func__seek(position: f64);
    fn __js_func__flush();
    fn __js_func__set_media_offset(media_offset: f64);
    fn __js_func__update_content_info(
        has_minimum_position: u32,
        minimum_position: f64,
        has_maximum_position: u32,
        maximum_position: f64,
        playlist_nat: u32,
    );
    fn __js_func__announce_fetched_content(
        variant_info_ptr: *const u32,
        variant_info_len: u32,
        audio_tracks_info_ptr: *const u32,
        audio_tracks_info_len: u32,
    );
    fn __js_func__announce_variant_update(variant_id: u32);
    fn __js_func__announce_track_update(media_type: u32, track_id: u32, is_selected: u32);
    fn __js_func__announce_variant_lock_status_change(variant_id: u32);
    fn __js_func__start_rebuffering();
    fn __js_func__stop_rebuffering();
    fn __js_func__get_random() -> f64;
    fn __js_func__send_segment_request_error(
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
    fn __js_func__send_multivariant_playlist_request_error(
        fatal: u32,
        url_ptr: *const u8,
        url_len: u32,
        reason: u32,
        status: u32,
    );
    fn __js_func__send_media_playlist_request_error(
        fatal: u32,
        url_ptr: *const u8,
        url_len: u32,
        reason: u32,
        media_type: u32,
        status: u32,
    );
    fn __js_func__send_source_buffer_creation_error(
        fatal: u32,
        code: u32,
        media_type: u32,
        message_ptr: *const u8,
        message_len: u32,
    );
    fn __js_func__send_multivariant_playlist_parsing_error(
        fatal: u32,
        code: u32,
        message_ptr: *const u8,
        message_len: u32,
    );
    fn __js_func__send_media_playlist_parsing_error(
        fatal: u32,
        code: u32,
        media_type: u32,
        message_ptr: *const u8,
        message_len: u32,
    );
    fn __js_func__send_segment_parsing_error(
        fatal: u32,
        code: u32,
        media_type: u32,
        message_ptr: *const u8,
        message_len: u32,
    );
    fn __js_func__send_pushed_segment_error(
        fatal: u32,
        code: u32,
        media_type: u32,
        message_ptr: *const u8,
        message_len: u32,
    );
    fn __js_func__send_remove_buffer_error(
        fatal: u32,
        media_type: u32,
        message_ptr: *const u8,
        message_len: u32,
    );
    fn __js_func__send_other_error(fatal: u32, code: u32, message_ptr: *const u8, message_len: u32);
}

fn bool_to_raw(value: bool) -> u32 {
    if value {
        1
    } else {
        0
    }
}

fn raw_to_opt_u32(value: u32) -> Option<u32> {
    if value == u32::MAX {
        None
    } else {
        Some(value)
    }
}

fn opt_u32_to_raw(value: Option<u32>) -> u32 {
    value.unwrap_or(u32::MAX)
}

fn opt_f64_to_raw_ptr(value: Option<f64>) -> *const f64 {
    match value {
        Some(ref v) => v as *const f64,
        None => std::ptr::null(),
    }
}

fn owned_string_from_abi(ptr: u32, len: u32) -> String {
    let bytes = unsafe { Vec::from_raw_parts(ptr as *mut u8, len as usize, len as usize) };
    String::from_utf8(bytes).unwrap_or_default()
}

fn opt_owned_string_from_abi(ptr: u32, len: u32) -> Option<String> {
    if ptr == 0 {
        None
    } else {
        Some(owned_string_from_abi(ptr, len))
    }
}

#[derive(Default)]
struct JsErrorOut {
    code: u32,
    desc_ptr: u32,
    desc_len: u32,
}

fn take_js_error_out<E>(out: JsErrorOut, map: impl FnOnce(u32) -> E) -> (E, Option<String>) {
    (
        map(out.code),
        opt_owned_string_from_abi(out.desc_ptr, out.desc_len),
    )
}

pub fn jsLog(log_level: LogLevel, log: &str) {
    unsafe { __js_func__log(log_level as u32, log.as_ptr(), log.len() as u32) }
}

pub fn jsTimer(duration: f64, reason: TimerReason) -> TimerId {
    unsafe { __js_func__timer(duration, reason as u32) }
}

pub fn jsClearTimer(id: TimerId) {
    unsafe { __js_func__clear_timer(id) }
}

pub fn jsGetResourceData(id: ResourceId) -> Option<Vec<u8>> {
    let len = unsafe { __js_func__get_resource_len(id) };
    if len < 0 {
        return None;
    }
    let len = len as usize;
    let mut data = vec![0_u8; len];
    let copied = unsafe { __js_func__copy_resource_data(id, data.as_mut_ptr(), len as u32) };
    if copied == 0 {
        None
    } else {
        Some(data)
    }
}

pub fn jsFetch(
    url: &str,
    range_base: Option<usize>,
    range_end: Option<usize>,
    timeout: f64,
) -> RequestId {
    unsafe {
        __js_func__fetch(
            url.as_ptr(),
            url.len() as u32,
            bool_to_raw(range_base.is_some()),
            range_base.unwrap_or(0),
            bool_to_raw(range_end.is_some()),
            range_end.unwrap_or(0),
            timeout,
        )
    }
}

pub fn jsAbortRequest(request_id: RequestId) -> bool {
    unsafe { __js_func__abort_request(request_id) != 0 }
}

pub fn jsAttachMediaSource() -> Result<(), (AttachMediaSourceErrorCode, Option<String>)> {
    let mut out = JsErrorOut::default();
    let success = unsafe {
        __js_func__attach_media_source(&mut out.code, &mut out.desc_ptr, &mut out.desc_len)
    };
    if success != 0 {
        Ok(())
    } else {
        Err(take_js_error_out(out, AttachMediaSourceErrorCode::from_raw))
    }
}

pub fn jsRemoveMediaSource() -> Result<(), (RemoveMediaSourceErrorCode, Option<String>)> {
    let mut out = JsErrorOut::default();
    let success = unsafe {
        __js_func__remove_media_source(&mut out.code, &mut out.desc_ptr, &mut out.desc_len)
    };
    if success != 0 {
        Ok(())
    } else {
        Err(take_js_error_out(out, RemoveMediaSourceErrorCode::from_raw))
    }
}

pub fn jsSetMediaSourceDuration(
    duration: f64,
) -> Result<(), (MediaSourceDurationUpdateErrorCode, Option<String>)> {
    let mut out = JsErrorOut::default();
    let success = unsafe {
        __js_func__set_media_source_duration(
            duration,
            &mut out.code,
            &mut out.desc_ptr,
            &mut out.desc_len,
        )
    };
    if success != 0 {
        Ok(())
    } else {
        Err(take_js_error_out(
            out,
            MediaSourceDurationUpdateErrorCode::from_raw,
        ))
    }
}

pub fn jsAddSourceBuffer(
    media_type: MediaType,
    typ: &str,
) -> Result<SourceBufferId, (AddSourceBufferErrorCode, Option<String>)> {
    let mut source_buffer_id = 0;
    let mut out = JsErrorOut::default();
    let success = unsafe {
        __js_func__add_source_buffer(
            media_type as u32,
            typ.as_ptr(),
            typ.len() as u32,
            &mut source_buffer_id,
            &mut out.code,
            &mut out.desc_ptr,
            &mut out.desc_len,
        )
    };
    if success != 0 {
        Ok(source_buffer_id)
    } else {
        Err(take_js_error_out(out, AddSourceBufferErrorCode::from_raw))
    }
}

pub fn jsIsTypeSupported(media_type: MediaType, typ: &str) -> Option<bool> {
    match unsafe { __js_func__is_type_supported(media_type as u32, typ.as_ptr(), typ.len() as u32) }
    {
        -1 => None,
        0 => Some(false),
        _ => Some(true),
    }
}

pub fn jsAppendBuffer(
    source_buffer_id: SourceBufferId,
    segment_id: ResourceId,
    parse_time_information: bool,
) -> Result<Option<ParsedSegmentInfo>, (SegmentParsingErrorCode, Option<String>)> {
    let mut has_start = 0;
    let mut start = 0.0;
    let mut has_duration = 0;
    let mut duration = 0.0;
    let mut out = JsErrorOut::default();
    let success = unsafe {
        __js_func__append_buffer(
            source_buffer_id,
            segment_id,
            bool_to_raw(parse_time_information),
            &mut has_start,
            &mut start,
            &mut has_duration,
            &mut duration,
            &mut out.code,
            &mut out.desc_ptr,
            &mut out.desc_len,
        )
    };
    if success == 0 {
        return Err(take_js_error_out(out, SegmentParsingErrorCode::from_raw));
    }
    if parse_time_information {
        Ok(Some(ParsedSegmentInfo {
            start: if has_start != 0 { Some(start) } else { None },
            duration: if has_duration != 0 {
                Some(duration)
            } else {
                None
            },
        }))
    } else {
        Ok(None)
    }
}

pub fn jsRemoveBuffer(
    source_buffer_id: SourceBufferId,
    start: f64,
    end: f64,
) -> Result<(), (RemoveBufferErrorCode, Option<String>)> {
    let mut out = JsErrorOut::default();
    let success = unsafe {
        __js_func__remove_buffer(
            source_buffer_id,
            start,
            end,
            &mut out.code,
            &mut out.desc_ptr,
            &mut out.desc_len,
        )
    };
    if success != 0 {
        Ok(())
    } else {
        Err(take_js_error_out(out, RemoveBufferErrorCode::from_raw))
    }
}

pub fn jsEndOfStream() -> Result<(), (EndOfStreamErrorCode, Option<String>)> {
    let mut out = JsErrorOut::default();
    let success =
        unsafe { __js_func__end_of_stream(&mut out.code, &mut out.desc_ptr, &mut out.desc_len) };
    if success != 0 {
        Ok(())
    } else {
        Err(take_js_error_out(out, EndOfStreamErrorCode::from_raw))
    }
}

pub fn jsStartObservingPlayback() {
    unsafe { __js_func__start_observing_playback() }
}

pub fn jsStopObservingPlayback() {
    unsafe { __js_func__stop_observing_playback() }
}

pub fn jsFreeResource(resource_id: ResourceId) -> bool {
    unsafe { __js_func__free_resource(resource_id) != 0 }
}

pub fn jsSetPlaybackRate(playback_rate: f64) {
    unsafe { __js_func__set_playback_rate(playback_rate) }
}

pub fn jsSeek(position: f64) {
    unsafe { __js_func__seek(position) }
}

pub fn jsFlush() {
    unsafe { __js_func__flush() }
}

pub fn jsSetMediaOffset(media_offset: f64) {
    unsafe { __js_func__set_media_offset(media_offset) }
}

pub fn jsUpdateContentInfo(
    minimum_position: Option<f64>,
    maximum_position: Option<f64>,
    playlist_nat: PlaylistNature,
) {
    unsafe {
        __js_func__update_content_info(
            bool_to_raw(minimum_position.is_some()),
            minimum_position.unwrap_or(0.),
            bool_to_raw(maximum_position.is_some()),
            maximum_position.unwrap_or(0.),
            playlist_nat as u32,
        )
    }
}

pub fn jsAnnounceFetchedContent(variant_info: Vec<u32>, audio_tracks_info: Vec<u32>) {
    unsafe {
        __js_func__announce_fetched_content(
            variant_info.as_ptr(),
            variant_info.len() as u32,
            audio_tracks_info.as_ptr(),
            audio_tracks_info.len() as u32,
        )
    }
}

pub fn jsAnnounceVariantUpdate(variant_id: Option<u32>) {
    unsafe { __js_func__announce_variant_update(opt_u32_to_raw(variant_id)) }
}

pub fn jsAnnounceTrackUpdate(media_type: MediaType, track_id: Option<u32>, is_selected: bool) {
    unsafe {
        __js_func__announce_track_update(
            media_type as u32,
            opt_u32_to_raw(track_id),
            bool_to_raw(is_selected),
        )
    }
}

pub fn jsAnnounceVariantLockStatusChange(variant_id: Option<u32>) {
    unsafe { __js_func__announce_variant_lock_status_change(opt_u32_to_raw(variant_id)) }
}

pub fn jsStartRebuffering() {
    unsafe { __js_func__start_rebuffering() }
}

pub fn jsStopRebuffering() {
    unsafe { __js_func__stop_rebuffering() }
}

pub fn jsGetRandom() -> f64 {
    unsafe { __js_func__get_random() }
}

pub fn jsSendSegmentRequestError(
    fatal: bool,
    url: &str,
    is_init: bool,
    time_info: Option<(f64, f64)>,
    media_type: MediaType,
    reason: RequestErrorReason,
    status: Option<u32>,
) {
    let start = time_info.map(|t| t.0);
    let duration = time_info.map(|t| t.1);
    unsafe {
        __js_func__send_segment_request_error(
            bool_to_raw(fatal),
            url.as_ptr(),
            url.len() as u32,
            bool_to_raw(is_init),
            media_type as u32,
            opt_f64_to_raw_ptr(start),
            opt_f64_to_raw_ptr(duration),
            reason as u32,
            opt_u32_to_raw(status),
        )
    }
}

pub fn jsSendMultivariantPlaylistRequestError(
    fatal: bool,
    url: &str,
    reason: RequestErrorReason,
    status: Option<u32>,
) {
    unsafe {
        __js_func__send_multivariant_playlist_request_error(
            bool_to_raw(fatal),
            url.as_ptr(),
            url.len() as u32,
            reason as u32,
            opt_u32_to_raw(status),
        )
    }
}

pub fn jsSendMediaPlaylistRequestError(
    fatal: bool,
    url: &str,
    reason: RequestErrorReason,
    media_type: Option<MediaType>,
    status: Option<u32>,
) {
    unsafe {
        __js_func__send_media_playlist_request_error(
            bool_to_raw(fatal),
            url.as_ptr(),
            url.len() as u32,
            reason as u32,
            opt_u32_to_raw(media_type.map(|m| m as u32)),
            opt_u32_to_raw(status),
        )
    }
}

pub fn jsSendSourceBufferCreationError(
    fatal: bool,
    code: SourceBufferCreationErrorCode,
    media_type: MediaType,
    message: &str,
) {
    unsafe {
        __js_func__send_source_buffer_creation_error(
            bool_to_raw(fatal),
            code as u32,
            media_type as u32,
            message.as_ptr(),
            message.len() as u32,
        )
    }
}

pub fn jsSendMultivariantPlaylistParsingError(
    fatal: bool,
    code: MultivariantPlaylistParsingErrorCode,
    message: &str,
) {
    unsafe {
        __js_func__send_multivariant_playlist_parsing_error(
            bool_to_raw(fatal),
            code as u32,
            message.as_ptr(),
            message.len() as u32,
        )
    }
}

pub fn jsSendMediaPlaylistParsingError(
    fatal: bool,
    code: MediaPlaylistParsingErrorCode,
    media_type: MediaType,
    message: &str,
) {
    unsafe {
        __js_func__send_media_playlist_parsing_error(
            bool_to_raw(fatal),
            code as u32,
            media_type as u32,
            message.as_ptr(),
            message.len() as u32,
        )
    }
}

pub fn jsSendSegmentParsingError(
    fatal: bool,
    code: SegmentParsingErrorCode,
    media_type: MediaType,
    message: &str,
) {
    unsafe {
        __js_func__send_segment_parsing_error(
            bool_to_raw(fatal),
            code as u32,
            media_type as u32,
            message.as_ptr(),
            message.len() as u32,
        )
    }
}

pub fn jsSendPushedSegmentError(
    fatal: bool,
    code: PushedSegmentErrorCode,
    media_type: MediaType,
    message: &str,
) {
    unsafe {
        __js_func__send_pushed_segment_error(
            bool_to_raw(fatal),
            code as u32,
            media_type as u32,
            message.as_ptr(),
            message.len() as u32,
        )
    }
}

pub fn jsSendRemoveBufferError(fatal: bool, media_type: MediaType, message: &str) {
    unsafe {
        __js_func__send_remove_buffer_error(
            bool_to_raw(fatal),
            media_type as u32,
            message.as_ptr(),
            message.len() as u32,
        )
    }
}

pub fn jsSendOtherError(fatal: bool, code: OtherErrorCode, message: &str) {
    unsafe {
        __js_func__send_other_error(
            bool_to_raw(fatal),
            code as u32,
            message.as_ptr(),
            message.len() as u32,
        )
    }
}
impl From<MultivariantPlaylistParsingError> for MultivariantPlaylistParsingErrorCode {
    fn from(value: MultivariantPlaylistParsingError) -> Self {
        match value {
            MultivariantPlaylistParsingError::MissingExtM3uHeader => {
                MultivariantPlaylistParsingErrorCode::MissingExtM3uHeader
            }
            MultivariantPlaylistParsingError::InvalidDecimalInteger => {
                MultivariantPlaylistParsingErrorCode::InvalidValue
            }
            MultivariantPlaylistParsingError::MediaTagMissingType => {
                MultivariantPlaylistParsingErrorCode::MediaTagMissingType
            }
            MultivariantPlaylistParsingError::MediaTagMissingName => {
                MultivariantPlaylistParsingErrorCode::MediaTagMissingName
            }
            MultivariantPlaylistParsingError::MediaTagMissingGroupId => {
                MultivariantPlaylistParsingErrorCode::MediaTagMissingGroupId
            }
            MultivariantPlaylistParsingError::VariantMissingBandwidth => {
                MultivariantPlaylistParsingErrorCode::VariantMissingBandwidth
            }
            MultivariantPlaylistParsingError::MissingUriLineAfterVariant => {
                MultivariantPlaylistParsingErrorCode::MissingUriLineAfterVariant
            }
            MultivariantPlaylistParsingError::UnableToReadVariantUri
            | MultivariantPlaylistParsingError::UnableToReadLine
            | MultivariantPlaylistParsingError::Unknown => {
                MultivariantPlaylistParsingErrorCode::Unknown
            }
        }
    }
}

impl From<MediaPlaylistUpdateError> for MediaPlaylistParsingErrorCode {
    fn from(value: MediaPlaylistUpdateError) -> Self {
        match value {
            MediaPlaylistUpdateError::ParsingError(MediaPlaylistParsingError::UnparsableExtInf) => {
                MediaPlaylistParsingErrorCode::UnparsableExtInf
            }
            MediaPlaylistUpdateError::ParsingError(MediaPlaylistParsingError::UriMissingInMap) => {
                MediaPlaylistParsingErrorCode::UriMissingInMap
            }
            MediaPlaylistUpdateError::ParsingError(
                MediaPlaylistParsingError::MissingTargetDuration,
            ) => MediaPlaylistParsingErrorCode::MissingTargetDuration,
            MediaPlaylistUpdateError::ParsingError(
                MediaPlaylistParsingError::UnparsableByteRange,
            ) => MediaPlaylistParsingErrorCode::UnparsableByteRange,
            MediaPlaylistUpdateError::ParsingError(MediaPlaylistParsingError::UriWithoutExtInf) => {
                MediaPlaylistParsingErrorCode::UriWithoutExtInf
            }
            MediaPlaylistUpdateError::NotFound => MediaPlaylistParsingErrorCode::Unknown,
        }
    }
}

pub struct ParsedSegmentInfo {
    pub start: Option<f64>,
    pub duration: Option<f64>,
}

impl From<PushSegmentError> for SegmentParsingErrorCode {
    fn from(value: PushSegmentError) -> Self {
        match value {
            PushSegmentError::NoResource(_) => SegmentParsingErrorCode::NoResource,
            PushSegmentError::NoSourceBuffer(_) => SegmentParsingErrorCode::NoSourceBuffer,
            PushSegmentError::TransmuxerError(_, _) => SegmentParsingErrorCode::TransmuxerError,
            PushSegmentError::UnknownError(_, _) => SegmentParsingErrorCode::UnknownError,
        }
    }
}

pub type ResourceId = u32;
pub type RequestId = u32;
pub type TimerId = f64;
pub type SourceBufferId = u32;

impl fmt::Display for MediaType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "{}",
            match self {
                MediaType::Audio => "audio",
                MediaType::Video => "video",
            }
        )
    }
}

pub(crate) fn f64_vec_from_abi(ptr: *const f64, len: usize) -> Vec<f64> {
    if len == 0 {
        Vec::new()
    } else {
        unsafe { slice::from_raw_parts(ptr, len).to_vec() }
    }
}
