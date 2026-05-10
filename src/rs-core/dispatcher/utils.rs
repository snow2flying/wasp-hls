use super::{segment_request_contexts::PendingSegmentRequest, StartingPosition};
use crate::{
    bindings::{MediaType, StartingPositionType},
    playlist_store::{PlaylistStore, ProbeSegmentContext, ProbeSegmentMetadata},
};

pub(super) fn was_last_segment(
    playlist_store: Option<&PlaylistStore>,
    media_type: MediaType,
    seg_start: f64,
) -> bool {
    playlist_store
        .and_then(|c| c.curr_media_playlist(media_type))
        .map(|pl| {
            pl.is_ended()
                && pl
                    .segment_list()
                    .media()
                    .last()
                    .map(|x| x.start() == seg_start)
                    .unwrap_or(false)
        })
        .unwrap_or(false)
}

pub(super) fn has_playlist_store_media_type(
    playlist_store: Option<&PlaylistStore>,
) -> Option<MediaType> {
    let playlist_store = playlist_store?;
    if playlist_store.has_media_type(MediaType::Video) {
        Some(MediaType::Video)
    } else if playlist_store.has_media_type(MediaType::Audio) {
        Some(MediaType::Audio)
    } else {
        None
    }
}

/// Returns the expected position at which we want to start playback, in seconds, according to
/// both configuration and playlist metadata.
pub(super) fn get_initial_position(
    playlist_store: &PlaylistStore,
    starting_position: Option<StartingPosition>,
) -> f64 {
    if let Some(starting_pos) = starting_position {
        match starting_pos.start_type {
            StartingPositionType::Absolute => starting_pos.position,
            StartingPositionType::FromBeginning => {
                playlist_store.curr_min_position().unwrap_or(0.) + starting_pos.position
            }
            StartingPositionType::FromEnd => playlist_store
                .curr_max_position()
                .map(|max| max - starting_pos.position)
                .unwrap_or(playlist_store.expected_start_time()),
        }
    } else {
        playlist_store.expected_start_time()
    }
}

pub(super) fn is_stale_segment_request_context(
    playlist_store: Option<&PlaylistStore>,
    context: &PendingSegmentRequest,
) -> bool {
    match context {
        PendingSegmentRequest::Media {
            media_type,
            sequence,
            ..
        } => playlist_store
            .as_ref()
            .and_then(|pl_store| pl_store.curr_media_playlist(*media_type))
            .is_some_and(|playlist| !playlist.contains_sequence(*sequence)),

        PendingSegmentRequest::Probe {
            probe_segment:
                ProbeSegmentMetadata {
                    context: ProbeSegmentContext::Media { sequence, .. },
                    ..
                },
        } => playlist_store
            .as_ref()
            .and_then(|pl_store| pl_store.direct_media_playlist())
            .is_some_and(|(_, playlist)| !playlist.contains_sequence(*sequence)),
        _ => false,
    }
}
