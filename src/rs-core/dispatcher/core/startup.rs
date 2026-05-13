use super::super::segment_request_contexts::PendingSegmentRequest;
use super::{utils, Dispatcher, PlayerReadyState, ReadyProbeSegment};
use crate::media_element::SegmentPushMetadata;
use crate::{
    bindings::{
        formatters::{
            format_audio_tracks_for_js, format_direct_media_audio_tracks_for_js,
            format_direct_media_variants_info_for_js, format_source_buffer_creation_err_for_js,
            format_variants_info_for_js, DIRECT_MEDIA_AUDIO_TRACK_ID, DIRECT_MEDIA_VARIANT_ID,
        },
        jsAnnounceFetchedContent, jsAnnounceTrackUpdate, jsAnnounceVariantUpdate, jsSendOtherError,
        jsSendSegmentParsingError, jsSendSourceBufferCreationError, jsSetMediaSourceDuration,
        jsStartObservingPlayback, MediaSourceReadyState, MediaType, OtherErrorCode, PlaylistNature,
        PlaylistType,
    },
    media_element::SourceBufferCreationError,
    playlist_store::{ProbeSegmentContext, ProbeSegmentMetadata, StartupStatus},
    requester::{PlaylistFileType, RequestLaneTag},
    Logger,
};

impl Dispatcher {
    /// Look if progress can be made in playing the current content by checking the full state
    pub(super) fn recheck_player_state(&mut self) {
        match self.ready_state {
            PlayerReadyState::Stopped => {}
            PlayerReadyState::AwaitingPlaylistInfo { .. } => {
                advance_awaiting_playlist_info_state(self)
            }
            PlayerReadyState::AwaitingMediaSource { .. } => {
                advance_awaiting_media_source_state(self)
            }
            PlayerReadyState::AwaitingSegments | PlayerReadyState::Playing => {
                self.check_segments_to_request();
            }
        };
    }
}

/// Try to progress `ready_state` when in the `AwaitingPlaylistInfo` state
fn advance_awaiting_playlist_info_state(dispatcher: &mut Dispatcher) {
    let (starting_position, playlist_store) =
        match (dispatcher.playlist_store.as_mut(), &dispatcher.ready_state) {
            (
                Some(playlist_store),
                PlayerReadyState::AwaitingPlaylistInfo { starting_position },
            ) => (*starting_position, playlist_store),
            _ => {
                return;
            }
        };

    // Progress through the "startup steps" of the linked `PlaylistStore`, returning `true`
    let wanted_position = utils::get_initial_position(playlist_store, starting_position);
    match playlist_store.startup_status(wanted_position) {
        Ok(StartupStatus::Ready) => {}
        Ok(StartupStatus::AwaitingSupportCheck) => return,
        Ok(StartupStatus::NeedsProbe(probe_segment)) => {
            if start_probe_segment_request(dispatcher, probe_segment) {
                return;
            } else {
                jsSendSegmentParsingError(
                    true,
                    crate::bindings::SegmentParsingErrorCode::UnknownError,
                    Some(MediaType::Video),
                    "No probe segment was available to determine startup metadata",
                );
                dispatcher.stop_current_content();
                return;
            }
        }
        Err(err) => {
            utils::handle_playlist_store_error(err);
            dispatcher.stop_current_content();
            return;
        }
    };

    // Ensure there's at least one variant that is supported here
    if playlist_store.playlist_kind() == PlaylistType::MultivariantPlaylist
        && playlist_store.supported_variants().is_empty()
    {
        jsSendOtherError(
            true,
            crate::bindings::OtherErrorCode::NoSupportedVariant,
            "Error while parsing MultivariantPlaylist: no compatible variant found.",
        );
        dispatcher.stop_current_content();
        return;
    }

    // Start fetching initial media playlists if needed
    for mt in [MediaType::Video, MediaType::Audio] {
        if playlist_store.curr_media_playlist(mt).is_some() {
            continue; // Already fetched
        }
        if let Some(id) = playlist_store.curr_media_playlist_id(mt) {
            if let Some(url) = playlist_store.media_playlist_url(id) {
                let id = id.clone();
                let url = url.clone();
                dispatcher
                    .requester
                    .fetch_playlist(url, PlaylistFileType::MediaPlaylist { id, media_type: mt });
            }
        }
    }

    // Now "Announce" lifecycle events if needed

    // SAFETY: The following lines are unsafe because they may actually define raw pointers
    // to point to Rust's heap memory and put it in the returned values.
    //
    // However, we're calling the JS binding function it is communicated to directly
    // after and thus before the corresponding underlying data had a chance to be
    // dropped.
    //
    // Because one of the rules of those bindings is to copy all pointed data
    // synchronously on call, we should not encounter any issue.
    let (variants_info, audio_tracks_info) = if playlist_store.playlist_kind()
        == PlaylistType::MediaPlaylist
    {
        let has_audio_track = playlist_store.has_media_type(MediaType::Audio);
        (
            unsafe { format_direct_media_variants_info_for_js() },
            unsafe { format_direct_media_audio_tracks_for_js(has_audio_track) },
        )
    } else {
        (
            unsafe { format_variants_info_for_js(playlist_store.supported_variants().as_slice()) },
            unsafe { format_audio_tracks_for_js(playlist_store.audio_tracks()) },
        )
    };
    let selected_audio_track = playlist_store.selected_audio_track_id();
    let is_selected = selected_audio_track.is_some();
    let curr_audio_track = if let Some(selected) = selected_audio_track {
        Some(selected)
    } else if playlist_store.playlist_kind() == PlaylistType::MediaPlaylist
        && playlist_store.has_media_type(MediaType::Audio)
    {
        Some(DIRECT_MEDIA_AUDIO_TRACK_ID)
    } else {
        playlist_store.curr_audio_track_id()
    };
    jsAnnounceFetchedContent(
        playlist_store.playlist_kind(),
        variants_info,
        audio_tracks_info,
    );

    let curr_variant = if playlist_store.playlist_kind() == PlaylistType::MediaPlaylist {
        Some(DIRECT_MEDIA_VARIANT_ID)
    } else {
        playlist_store.curr_variant().map(|v| v.id())
    };
    jsAnnounceVariantUpdate(curr_variant);
    jsAnnounceTrackUpdate(MediaType::Audio, curr_audio_track, is_selected);

    if playlist_store.are_playlists_ready() {
        dispatcher.ready_state = PlayerReadyState::AwaitingMediaSource { starting_position };
        dispatcher.recheck_player_state();
    }
}

/// Try to progress `ready_state` when in the `AwaitingMediaSource` state
fn advance_awaiting_media_source_state(dispatcher: &mut Dispatcher) {
    let starting_pos = match (
        &dispatcher.ready_state,
        dispatcher.media_element_ref.media_source_ready_state(),
    ) {
        (_, Some(MediaSourceReadyState::Closed) | None) => {
            return;
        }
        (PlayerReadyState::AwaitingMediaSource { starting_position }, _) => *starting_position,
        _ => {
            return;
        }
    };

    let Some(playlist_store) = dispatcher.playlist_store.as_ref() else {
        return;
    };

    let wanted_start = utils::get_initial_position(playlist_store, starting_pos);
    if wanted_start > 0. {
        dispatcher.media_element_ref.seek(wanted_start);
    }

    dispatcher.ready_state = PlayerReadyState::AwaitingSegments;
    if playlist_store.playlist_type() != PlaylistNature::VoD {
        let _ = jsSetMediaSourceDuration(u32::MAX as f64);
    } else if let Some(duration) = playlist_store.curr_duration() {
        let _ = jsSetMediaSourceDuration(duration);
    } else {
        Logger::warn("Core: Unknown content duration");
    }

    if let Some(Err(e)) = init_source_buffer(dispatcher, MediaType::Audio) {
        let (code, msg) = format_source_buffer_creation_err_for_js(e);
        jsSendSourceBufferCreationError(true, code, MediaType::Audio, &msg);
        dispatcher.stop_current_content();
        return;
    }
    if let Some(Err(e)) = init_source_buffer(dispatcher, MediaType::Video) {
        let (code, msg) = format_source_buffer_creation_err_for_js(e);
        jsSendSourceBufferCreationError(true, code, MediaType::Video, &msg);
        dispatcher.stop_current_content();
        return;
    }
    jsStartObservingPlayback();
    consume_probe_segment(dispatcher);
}

/// Start a startup probe request if not already in progress.
///
/// Probe segment requests are segment requests with the goal of obtaining more
/// information not found in the playlist(s): which codecs is it and other attributes.
///
/// # Returns
///
/// Returns `true` if the probe process has been started, or `false` if we
/// cannot do that.
fn start_probe_segment_request(
    dispatcher: &mut Dispatcher,
    probe_segment: ProbeSegmentMetadata,
) -> bool {
    if dispatcher.ready_probe_segment.is_some()
        || dispatcher.segment_request_contexts.has(|a| a.is_probe())
    {
        return true; // probe already going on
    }

    let req_id = dispatcher
        .segment_request_contexts
        .insert(PendingSegmentRequest::Probe {
            // TODO: cloning here may be unnecessary if we're smart about it? Though
            // it may be not worth it.
            probe_segment: probe_segment.clone(),
        });
    match &probe_segment.context {
        ProbeSegmentContext::Init { .. } => dispatcher.requester.request_segment_immediately(
            RequestLaneTag::Probe,
            &probe_segment.url,
            probe_segment.byte_range.as_ref(),
            None,
            req_id,
        ),
        ProbeSegmentContext::Media { time_info, .. } => {
            dispatcher.requester.request_segment_immediately(
                RequestLaneTag::Probe,
                &probe_segment.url,
                probe_segment.byte_range.as_ref(),
                Some(time_info.clone()),
                req_id,
            )
        }
    }
    true
}

fn init_source_buffer(
    dispatcher: &mut Dispatcher,
    media_type: MediaType,
) -> Option<Result<(), SourceBufferCreationError>> {
    let content = dispatcher.playlist_store.as_mut()?;
    content.curr_media_playlist(media_type)?;
    let mime_type = content.current_mime_type(media_type)?;
    let codec = content.current_codec(media_type)?;
    Some(
        dispatcher
            .media_element_ref
            .create_source_buffer(media_type, &mime_type, &codec),
    )
}

/// In certain conditions, a "probe segment" may be fetched initially to gather more
/// metadata on the content to play.
///
/// As it is usable data and should anyway correspond to the initial segment to load, this
/// method allows to both reset that state and to push it to the buffers.
fn consume_probe_segment(dispatcher: &mut Dispatcher) {
    let Some(ReadyProbeSegment { request, data }) = dispatcher.ready_probe_segment.take() else {
        return; // No stored probe segment
    };
    let Some(media_type) = utils::has_playlist_store_media_type(dispatcher.playlist_store.as_ref())
    else {
        jsSendOtherError(
            true,
            OtherErrorCode::Unknown,
            "No direct-media type could be resolved after probing",
        );
        dispatcher.stop_current_content();
        return;
    };

    match request.context {
        ProbeSegmentContext::Init { id } => {
            dispatcher.on_init_segment_loaded(data, media_type, id);
        }
        ProbeSegmentContext::Media {
            sequence,
            discontinuity_sequence,
            time_info,
        } => {
            let Some((segment_list, context)) = dispatcher
                .playlist_store
                .as_ref()
                .and_then(|store| store.curr_media_playlist_segment_info(media_type))
            else {
                jsSendOtherError(
                    true,
                    OtherErrorCode::Unknown,
                    "No direct-media context could be resolved after probing",
                );
                dispatcher.stop_current_content();
                return;
            };
            let init_segment_id = segment_list
                .media()
                .iter()
                .find(|seg| seg.sequence() == sequence)
                .and_then(|seg| segment_list.init_for(seg))
                .map(|init| init.id());
            dispatcher.on_media_segment_loaded(SegmentPushMetadata {
                data,
                media_type,
                time_info,
                context,
                init_segment_id,
                sequence_number: sequence,
                discontinuity_sequence,
            });
        }
    }
}
