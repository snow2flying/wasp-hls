use crate::{
    media_element::SourceBufferCreationError,
    parser::{AudioTrack, ByteRange, VariantStream, VideoDynamicRange, VideoResolution},
};

static NULL_RESOLUTION: VideoResolution = VideoResolution::new(0, 0);

pub(crate) unsafe fn format_variants_info_for_js(variants: &[&VariantStream]) -> Vec<u32> {
    let mut ret: Vec<u32> = vec![];
    ret.push(variants.len() as u32);
    variants.iter().for_each(|v| {
        ret.push(v.id());
        let resolution = v.resolution().unwrap_or(&NULL_RESOLUTION);
        ret.push(resolution.height());
        ret.push(resolution.width());
        ret.push(v.frame_rate().unwrap_or(0.) as u32);
        ret.push(v.bandwidth() as u32);
        ret.push(if v.has_type(crate::bindings::MediaType::Video) {
            match v.video_range() {
                VideoDynamicRange::Sdr => 1,
                VideoDynamicRange::Hlg => 2,
                VideoDynamicRange::Pq => 3,
                VideoDynamicRange::Unknown => 4,
            }
        } else {
            0
        });
    });
    ret
}

pub(crate) fn format_range_for_js(original: Option<&ByteRange>) -> (Option<usize>, Option<usize>) {
    match original {
        None => (None, None),
        Some(ByteRange {
            first_byte,
            last_byte,
        }) => (Some(*first_byte), Some(*last_byte)),
    }
}

use super::SourceBufferCreationErrorCode;
pub(crate) fn format_source_buffer_creation_err_for_js(
    err: SourceBufferCreationError,
) -> (SourceBufferCreationErrorCode, String) {
    match err {
        SourceBufferCreationError::EmptyMimeType => (
            crate::bindings::SourceBufferCreationErrorCode::EmptyMimeType,
            err.to_string(),
        ),
        SourceBufferCreationError::NoMediaSourceAttached { .. } => (
            crate::bindings::SourceBufferCreationErrorCode::NoMediaSourceAttached,
            err.to_string(),
        ),
        SourceBufferCreationError::MediaSourceIsClosed => (
            crate::bindings::SourceBufferCreationErrorCode::MediaSourceIsClosed,
            err.to_string(),
        ),
        SourceBufferCreationError::QuotaExceededError { .. } => (
            crate::bindings::SourceBufferCreationErrorCode::QuotaExceededError,
            err.to_string(),
        ),
        SourceBufferCreationError::CantPlayType { .. } => (
            crate::bindings::SourceBufferCreationErrorCode::CantPlayType,
            err.to_string(),
        ),
        SourceBufferCreationError::AlreadyCreatedWithSameType { .. } => (
            crate::bindings::SourceBufferCreationErrorCode::AlreadyCreatedWithSameType,
            err.to_string(),
        ),
        SourceBufferCreationError::UnknownError { .. } => (
            crate::bindings::SourceBufferCreationErrorCode::Unknown,
            err.to_string(),
        ),
    }
}

pub(crate) unsafe fn format_audio_tracks_for_js(tracks: &[AudioTrack]) -> Vec<u32> {
    let mut ret: Vec<u32> = vec![];
    ret.push(tracks.len() as u32);
    tracks.iter().for_each(|t| {
        ret.push(t.id());

        let language = t.language().unwrap_or("");
        ret.push(language.len() as u32);
        ret.push(language.as_ptr() as u32);

        let assoc_language = t.assoc_language().unwrap_or("");
        ret.push(assoc_language.len() as u32);
        ret.push(assoc_language.as_ptr() as u32);

        let name = t.name();
        ret.push(name.len() as u32);
        ret.push(name.as_ptr() as u32);
        ret.push(t.channels().unwrap_or(0));

        let characteristics = t.characteristics();
        ret.push(characteristics.len() as u32);
        characteristics.iter().for_each(|characteristic| {
            ret.push(characteristic.len() as u32);
            ret.push(characteristic.as_ptr() as u32);
        });

        ret.push(t.bit_depth().unwrap_or(0));
        ret.push(t.sample_rate().unwrap_or(0));

        let bit_depths = t.bit_depths();
        ret.push(bit_depths.len() as u32);
        bit_depths.iter().for_each(|bit_depth| ret.push(*bit_depth));

        let sample_rates = t.sample_rates();
        ret.push(sample_rates.len() as u32);
        sample_rates
            .iter()
            .for_each(|sample_rate| ret.push(*sample_rate));
    });
    ret
}
