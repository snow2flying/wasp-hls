use super::{
    event_listeners::JsTimeRanges, utils, Dispatcher, JsMemoryBlob, MediaObservation,
    MediaSourceReadyState, PlaybackTickReason, PlayerReadyState, ReadyProbeSegment,
};
use crate::{
    bindings::{
        formatters::format_source_buffer_creation_err_for_js, jsAnnounceTrackUpdate,
        jsAnnounceVariantLockStatusChange, jsAnnounceVariantUpdate, jsInspectSegment,
        jsSendMediaPlaylistParsingError, jsSendMediaPlaylistRequestError,
        jsSendMultivariantPlaylistParsingError, jsSendMultivariantPlaylistRequestError,
        jsSendOtherError, jsSendPushedSegmentError, jsSendRemoveBufferError,
        jsSendSegmentParsingError, jsSendSegmentRequestError, jsSendSourceBufferCreationError,
        jsStopObservingPlayback, jsUpdateContentInfo, AddSourceBufferErrorCode, MediaType,
        OtherErrorCode, PushedSegmentErrorCode, RequestId, SourceBufferId, TimerId,
    },
    dispatcher::segment_request_contexts::PendingSegmentRequest,
    media_element::SegmentPushMetadata,
    parser::{TopLevelPlaylist, TopLevelPlaylistParsingError},
    playlist_store::{
        LockVariantResponse, MediaPlaylistPermanentId, PlaylistStore, ProbeSegmentMetadata,
        SetAudioTrackResponse, VariantUpdateResult,
    },
    requester::{
        FinishedRequestType, PlaylistFileType, PlaylistRequestInfo, RetryResult, SegmentRequestInfo,
    },
    utils::url::Url,
    Logger,
};

mod startup;

impl Dispatcher {
    /// Completely stop playback of the current content if one and free all its associated
    /// resources.
    pub(super) fn stop_current_content(&mut self) {
        Logger::info("Core: Stopping current content (if one) and resetting player");
        self.requester.reset();
        self.segment_request_contexts.clear();
        jsStopObservingPlayback();
        self.media_element_ref.reset();
        self.segment_selectors.reset_selectors(0.);
        self.playlist_store = None;
        self.ready_probe_segments.clear();
        self.last_position = 0.;
        self.clean_up_playlist_refresh_timers();
        self.ready_state = PlayerReadyState::Stopped;
    }

    /// Check which is the best HLS variant to select according to the current conditions
    /// If it changed, handle the consequences (such as requesting new media playlists, loading
    /// and pushing segments etc.).
    pub(super) fn check_best_variant(&mut self) {
        if let Some(pl_store) = self.playlist_store.as_mut() {
            let bandwidth = self.adaptive_selector.get_estimate();
            Logger::debug(&format!("Core: New bandwidth estimate: {}", bandwidth));
            let speed = self.media_element_ref.wanted_speed();
            let actually_used_bandwidth = if speed.is_finite() && speed > 0.0 {
                bandwidth / speed
            } else {
                // TODO: Revisit ABR behavior for non-positive playback rates if reverse playback
                // becomes a first-class use case. The current pipeline remains forward-oriented,
                // so negative rates should not currently alter bandwidth scaling. Non-finite
                // rates are also ignored here defensively to avoid poisoning ABR decisions.
                bandwidth
            };
            let update = pl_store.update_curr_bandwidth(actually_used_bandwidth);
            self.handle_variant_update(update, false);
        }
    }

    /// Begin "locking" HLS variant whose `id` is given in argument, meaning that we will keep only
    /// playing that one.
    pub(super) fn lock_variant_core(&mut self, variant_id: u32) {
        if let Some(pl_store) = self.playlist_store.as_mut() {
            let is_audio_track_selected = pl_store.curr_audio_track_id().is_some();
            match pl_store.lock_variant(variant_id) {
                LockVariantResponse::NoVariantWithId => {
                    Logger::warn("Core: Locked variant not found");
                    jsSendOtherError(
                        false,
                        crate::bindings::OtherErrorCode::UnfoundLockedVariant,
                        &format!("Wanted locked variant \"{variant_id}\" not found"),
                    );
                }
                LockVariantResponse::VariantLocked {
                    updates,
                    audio_track_change,
                } => {
                    if let Some(track_id) = audio_track_change {
                        jsAnnounceTrackUpdate(
                            MediaType::Audio,
                            Some(track_id),
                            is_audio_track_selected,
                        );
                    }
                    self.handle_variant_update(updates, true);
                    jsAnnounceVariantLockStatusChange(Some(variant_id));
                }
            }
        }
    }

    /// Remove an HLS variant previously put in place through `lock_variant_core`.
    pub(super) fn unlock_variant_core(&mut self) {
        if let Some(pl_store) = self.playlist_store.as_mut() {
            let update = pl_store.unlock_variant();
            self.handle_variant_update(update, false);
        }
    }

    /// Method to call once a timer for Playlist refresh, started with the jsTimer JavaScript
    /// function, has finished, with the corrsonding `TimerId` as argument.
    pub(super) fn on_playlist_refresh_timer_ended(&mut self, id: TimerId) {
        let (Some(playlist_id), Some(playlist_store)) = (
            self.playlist_refresh_timers.resolve_timer(id),
            &self.playlist_store,
        ) else {
            return;
        };

        if let (Some(url), Some(media_type)) = (
            playlist_store.media_playlist_url(&playlist_id),
            playlist_store.curr_media_type_for(&playlist_id),
        ) {
            self.requester.fetch_playlist(
                url.clone(),
                PlaylistFileType::MediaPlaylist {
                    id: playlist_id,
                    media_type,
                },
            );
        } else {
            Logger::error("Core: Cannot refresh Media Playlist: id not found");
        }
    }

    /// Method to call once a timer for retrying a request, started with the jsTimer JavaScript
    /// function, has finished, with the corrsonding `TimerId` as argument.
    pub(super) fn on_retry_request(&mut self, id: TimerId) {
        self.requester.on_timer_finished(id);
    }

    /// Set an audio track whose `id` is given in argument.
    pub(super) fn set_audio_track_core(&mut self, track_id: Option<u32>) {
        if let Some(ref mut pl_store) = self.playlist_store {
            match pl_store.set_audio_track(track_id) {
                SetAudioTrackResponse::AudioMediaUpdate => {
                    self.handle_media_playlist_update(&[MediaType::Audio], true, true)
                }
                SetAudioTrackResponse::VariantUpdate {
                    updates,
                    unlocked_variant,
                } => {
                    self.handle_variant_update(updates, true);
                    if unlocked_variant {
                        jsAnnounceVariantLockStatusChange(None);
                    }
                }
                _ => {}
            }
        }
    }

    /// Method to call once a request started with `jsFetch` finished with success
    pub(super) fn on_request_succeeded(
        &mut self,
        request_id: RequestId,
        data: JsMemoryBlob,
        final_url: Url,
        resource_size: u32,
        duration_ms: f64,
    ) {
        match self.requester.on_pending_request_success(request_id) {
            Some(FinishedRequestType::Segment(seg_info)) => {
                self.on_segment_fetch_success(seg_info, data, resource_size, duration_ms)
            }
            Some(FinishedRequestType::Playlist(pl_info)) => {
                self.on_playlist_fetch_success(pl_info, data.obtain(), final_url)
            }
            None => Logger::warn("Core: Unknown request finished"),
        }
    }

    /// Method to call once a request started with `jsFetch` finished with a failure.
    pub(super) fn on_request_failed_core(
        &mut self,
        request_id: RequestId,
        has_timeouted: bool,
        status: Option<u32>,
    ) {
        match self
            .requester
            .on_pending_request_failure(request_id, has_timeouted, status)
        {
            // Failing segment request
            RetryResult::Failed {
                request_type: FinishedRequestType::Segment(s),
                reason,
                status,
            } => {
                let req_ctxt = self.segment_request_contexts.take(s.id());
                if let Some(media_type) = req_ctxt
                    .as_ref()
                    .and_then(|ctxt| ctxt.requested_media_type())
                {
                    self.ready_probe_segments.clear_media_type(media_type);
                }

                if status.is_some_and(|s| s == 404 || s == 410)
                    && req_ctxt.as_ref().is_some_and(|ctxt| {
                        utils::is_stale_segment_request_context(self.playlist_store.as_ref(), ctxt)
                    })
                {
                    Logger::info(
                        "Core: Ignoring terminal 404/410 for segment no longer in the live window",
                    );
                    if req_ctxt
                        .as_ref()
                        .is_some_and(PendingSegmentRequest::is_probe)
                    {
                        self.recheck_player_state();
                    } else {
                        self.check_segments_to_request();
                    }
                    return;
                }

                let time_info = s.time_info();
                jsSendSegmentRequestError(
                    true,
                    s.url().get_ref(),
                    time_info.is_none(),
                    time_info.map(|t| (t.start(), t.end())),
                    s.media_type(),
                    reason,
                    status,
                );
                self.stop_current_content();
            }
            // Failing playlist request
            RetryResult::Failed {
                request_type: FinishedRequestType::Playlist(x),
                reason,
                status,
                ..
            } => {
                match x.playlist_type {
                    PlaylistFileType::MediaPlaylist { media_type, .. } => {
                        jsSendMediaPlaylistRequestError(
                            true,
                            x.url.get_ref(),
                            reason,
                            Some(media_type),
                            status,
                        );
                    }
                    PlaylistFileType::TopLevelPlaylist => {
                        jsSendMultivariantPlaylistRequestError(
                            true,
                            x.url.get_ref(),
                            reason,
                            status,
                        );
                    }
                }
                self.stop_current_content();
            }

            RetryResult::RetriedSegment {
                request_info,
                reason,
                status,
            } => {
                jsSendSegmentRequestError(
                    false,
                    request_info.url().get_ref(),
                    request_info.time_info().is_none(),
                    request_info.time_info().map(|t| (t.start(), t.end())),
                    request_info.media_type(),
                    reason,
                    status,
                );
            }

            RetryResult::RetriedPlaylist {
                request_info,
                reason,
                status,
            } => match request_info.playlist_type {
                PlaylistFileType::TopLevelPlaylist => jsSendMultivariantPlaylistRequestError(
                    false,
                    request_info.url.get_ref(),
                    reason,
                    status,
                ),
                PlaylistFileType::MediaPlaylist { media_type, .. } => {
                    jsSendMediaPlaylistRequestError(
                        false,
                        request_info.url.get_ref(),
                        reason,
                        Some(media_type),
                        status,
                    )
                }
            },

            RetryResult::NotFound => {
                Logger::warn("Core: Request failed not found on the current Requester")
            }
        }
    }

    /// Method to call when the `readyState` JS attribute of the linked `MediaSource` object
    /// changed, with that new state in argument.
    pub(super) fn on_media_source_state_change_core(&mut self, state: MediaSourceReadyState) {
        Logger::info(&format!("Core: MediaSource state changed: {:?}", state));
        self.media_element_ref
            .update_media_source_ready_state(state);
        self.recheck_player_state();
    }

    /// Method to call when a `SourceBuffer`'s creation failed.
    pub(super) fn on_source_buffer_creation_error_core(
        &mut self,
        source_buffer_id: SourceBufferId,
        original_error: (AddSourceBufferErrorCode, Option<String>),
    ) {
        if let Some((media_type, e)) = self
            .media_element_ref
            .on_source_buffer_creation_error(source_buffer_id, original_error)
        {
            let (code, msg) = format_source_buffer_creation_err_for_js(e);
            jsSendSourceBufferCreationError(true, code, media_type, &msg);
            self.stop_current_content();
        }
    }

    /// Method to call when a SourceBuffer triggered an `updateend` event.
    pub(super) fn on_source_buffer_update_core(
        &mut self,
        source_buffer_id: SourceBufferId,
        buffered: JsTimeRanges,
    ) {
        self.media_element_ref
            .on_source_buffer_update(source_buffer_id, buffered, true);
    }

    /// Method to call when a `SourceBuffer`'s `appendBuffer` call led to an `error` event.
    pub(super) fn on_append_buffer_error_core(
        &mut self,
        source_buffer_id: SourceBufferId,
        code: PushedSegmentErrorCode,
        buffered: JsTimeRanges,
    ) {
        self.media_element_ref
            .on_source_buffer_update(source_buffer_id, buffered, false);

        match self.media_element_ref.media_type_for(source_buffer_id) {
            Some(mt) => {
                if code == PushedSegmentErrorCode::BufferFull {
                    let wanted_pos = self.media_element_ref.wanted_position();
                    let min_pos = if wanted_pos < 10. {
                        0.
                    } else {
                        wanted_pos - 10.
                    };
                    let max_pos = wanted_pos + self.buffer_goal + 10.;

                    let has_segments_to_delete =
                        self.media_element_ref.inventory(mt).iter().any(|x| {
                            x.last_buffered_start() < min_pos || x.last_buffered_end() > max_pos
                        });
                    if has_segments_to_delete {
                        Logger::warn(&format!(
                            "BufferFull error received for {}. Cleaning < {}, > {}.",
                            mt, min_pos, max_pos
                        ));
                        if let (Ok(_), Ok(_)) = (
                            self.media_element_ref.remove_data(mt, 0., min_pos),
                            self.media_element_ref.remove_data(mt, max_pos, f64::MAX),
                        ) {
                            self.segment_selectors
                                .restart_from_position(wanted_pos - 0.2);
                            return;
                        }
                    }

                    // TODO Dynamically reduce the buffer goal after repeated
                    // BufferFull errors?
                }

                let message = match code {
                    PushedSegmentErrorCode::BufferFull => format!(
                        "The {mt} `SourceBuffer` was full and could not accept anymore segment"
                    ),
                    PushedSegmentErrorCode::UnknownError => format!(
                        "An error happened while calling `appendBuffer` on the {mt} `SourceBuffer`"
                    ),
                };
                jsSendPushedSegmentError(true, code, mt, &message);
            }
            None => jsSendOtherError(
                true,
                OtherErrorCode::Unknown,
                "An unknown SourceBuffer failed during a push operation.",
            ),
        }
        self.stop_current_content();
    }

    /// Method to call when a `SourceBuffer`'s `remove` call led to an `error` event.
    pub(super) fn on_remove_buffer_error_core(
        &mut self,
        source_buffer_id: SourceBufferId,
        buffered: JsTimeRanges,
    ) {
        self.media_element_ref
            .on_source_buffer_update(source_buffer_id, buffered, false);
        match self.media_element_ref.media_type_for(source_buffer_id) {
            Some(mt) => {
                let message =
                    &format!("An error happened while calling `remove` on the {mt} `SourceBuffer`");
                jsSendRemoveBufferError(true, mt, message);
            }
            None => jsSendOtherError(
                true,
                OtherErrorCode::Unknown,
                "An unknown SourceBuffer failed during a remove operation.",
            ),
        }
        self.stop_current_content();
    }

    /// Method to call when a new `MediaObservation` has been received.
    pub(super) fn on_observation(&mut self, observation: MediaObservation) {
        let reason = observation.reason();
        Logger::debug(&format!(
            "Tick received: {:?} {}",
            reason,
            observation.current_time()
        ));
        self.media_element_ref.on_observation(observation);
        match reason {
            PlaybackTickReason::Seeking => self.on_seek(),
            _ => self.on_regular_tick(),
        }
    }

    /// Method to call when a new codec support report has been received.
    pub(super) fn on_codecs_support_update_core(&mut self) {
        self.recheck_player_state();
    }

    /// For each media type, check if segment need to be requested, and if that's the case, perform
    /// the request.
    ///
    /// This method is intelligent enough to not do new requests if some are already pending for
    /// the same type, meaning that you can call it any time you may want to check if segments can
    /// be requested (when a request finished, when a media playlist has been updated, when the
    /// playhead advances etc.).
    pub(super) fn check_segments_to_request(&mut self) {
        if self
            .playlist_store
            .as_ref()
            .is_some_and(|pl_store| !pl_store.are_playlists_ready())
        {
            return;
        }
        if !startup::ensure_current_streams_ready(self, self.media_element_ref.wanted_position()) {
            return;
        }
        let was_already_locked = self.requester.lock_segment_requests();
        [MediaType::Video, MediaType::Audio]
            .into_iter()
            .for_each(|mt| {
                self.check_segment_to_request_for_type(mt);
            });
        if !was_already_locked {
            self.requester.unlock_segment_requests();
        }
    }

    /// Once a "probe segment" has been loaded, it needs to be inspected so information
    /// can be extracted from it and the state be updated accordingly.
    ///
    /// This is what this method does: inspect the segment and update the playlist state
    /// accordingly.
    fn do_probe_segment_inspection(
        &mut self,
        probe_segment: ProbeSegmentMetadata,
        requested_media_type: Option<MediaType>,
        data: JsMemoryBlob,
    ) {
        let Some(playlist_store) = self.playlist_store.as_mut() else {
            Logger::error("Core: asked to do segment inspection without having a playlist store");
            return;
        };

        let inspection = match jsInspectSegment(data.id()) {
            Ok(inspection) => inspection,
            Err((code, message)) => {
                jsSendSegmentParsingError(
                    true,
                    code,
                    requested_media_type,
                    message
                        .as_deref()
                        .unwrap_or("Unknown probe segment parsing error"),
                );
                self.stop_current_content();
                return;
            }
        };

        // Update playlist information with inspection result
        let media_info = crate::parser::DirectMediaInfo {
            mime_type: inspection.mime_type,
            media_type: inspection.media_type,
            codec: inspection.codec,
        };
        let resolved_media_type = match playlist_store.playlist_kind() {
            crate::bindings::PlaylistType::MediaPlaylist => {
                let media_type = media_info.media_type;
                playlist_store.set_direct_media_info(media_info);
                media_type
            }
            crate::bindings::PlaylistType::MultivariantPlaylist => {
                let Some(media_type) = requested_media_type else {
                    jsSendOtherError(
                        true,
                        OtherErrorCode::Unknown,
                        "Missing media type for multivariant probe result",
                    );
                    self.stop_current_content();
                    return;
                };
                playlist_store.set_multivariant_media_info(media_type, media_info);
                media_type
            }
        };

        // That might have led to more timing-related information
        jsUpdateContentInfo(
            playlist_store.curr_min_position(),
            playlist_store.curr_max_position(),
            playlist_store.playlist_type(),
        );

        // Store segment for future playback
        self.ready_probe_segments.insert(ReadyProbeSegment {
            request: probe_segment,
            media_type: resolved_media_type,
            data,
        });
    }

    /// Method called once a playlist request ended with success
    fn on_playlist_fetch_success(
        &mut self,
        pl_info: PlaylistRequestInfo,
        data: Vec<u8>,
        final_url: Url,
    ) {
        let PlaylistRequestInfo { playlist_type, .. } = pl_info;
        match playlist_type {
            PlaylistFileType::TopLevelPlaylist => {
                self.on_top_level_playlist_loaded(data, final_url)
            }

            PlaylistFileType::MediaPlaylist { id, media_type } => {
                Logger::info(&format!(
                    "Media playlist loaded successfully: {}",
                    final_url.get_ref()
                ));
                let refresh_interval = {
                    let Some(playlist_store) = self.playlist_store.as_mut() else {
                        jsSendOtherError(
                            true,
                            OtherErrorCode::Unknown,
                            "Media playlist loaded but no top-level playlist",
                        );
                        self.stop_current_content();
                        return;
                    };
                    match playlist_store.update_media_playlist(&id, data.as_ref(), final_url) {
                        Err(e) => {
                            let err_message = e.to_string();
                            jsSendMediaPlaylistParsingError(
                                true,
                                e.into(),
                                Some(media_type),
                                &err_message,
                            );
                            self.stop_current_content();
                            return;
                        }
                        Ok(p) => p.refresh_interval(),
                    }
                };
                self.process_parsed_media_playlist(id, refresh_interval);
            }
        }
    }

    /// Method called once the top-level Playlist was loaded with success, with its response data
    /// and url as argument.
    fn on_top_level_playlist_loaded(&mut self, data: Vec<u8>, playlist_url: Url) {
        Logger::info("Core: top-level playlist loaded");
        match TopLevelPlaylist::parse(data.as_ref(), playlist_url) {
            Err(err) => {
                let message = err.to_string();
                match err {
                    TopLevelPlaylistParsingError::Multivariant(err) => {
                        jsSendMultivariantPlaylistParsingError(true, err.into(), &message);
                    }
                    TopLevelPlaylistParsingError::Media(err) => {
                        jsSendMediaPlaylistParsingError(true, err.into(), None, &message);
                    }
                    TopLevelPlaylistParsingError::NotAPlaylist => {
                        jsSendOtherError(true, OtherErrorCode::NotAPlaylist, &message);
                    }
                }
                self.stop_current_content();
            }
            Ok(pl) => {
                Logger::info("Core: top-level playlist parsed successfully");
                let estimate = self.adaptive_selector.get_estimate();
                match PlaylistStore::try_new(pl, estimate) {
                    Ok(pl_store) => {
                        // TODO: ugly
                        let direct_media_refresh = pl_store
                            .direct_media_playlist()
                            .map(|(id, playlist)| (*id, playlist.refresh_interval()));

                        self.playlist_store = Some(pl_store);
                        if let Some((playlist_id, refresh_interval)) = direct_media_refresh {
                            self.process_parsed_media_playlist(playlist_id, refresh_interval);
                        }
                        self.recheck_player_state();
                    }
                    Err(err) => {
                        utils::handle_playlist_store_error(err);
                        self.stop_current_content();
                    }
                }
            }
        }
    }

    /// Method called once a Media Playlist was parsed with success
    fn process_parsed_media_playlist(
        &mut self,
        playlist_id: MediaPlaylistPermanentId,
        refresh_interval: Option<f64>,
    ) {
        self.playlist_refresh_timers
            .set_timer(playlist_id, refresh_interval);

        let Some(playlist_store) = self.playlist_store.as_ref() else {
            return;
        };
        if let Some(duration) = playlist_store.segment_target_duration() {
            let mut min_buffer_time = f64::max(3., duration - 1.);
            min_buffer_time = f64::min(8., min_buffer_time);
            Logger::debug(&format!(
                "Core: Updating min_buffer_time: {min_buffer_time}"
            ));
            self.media_element_ref
                .update_min_buffer_time(min_buffer_time);
        }

        // That might have led to more timing-related information
        jsUpdateContentInfo(
            playlist_store.curr_min_position(),
            playlist_store.curr_max_position(),
            playlist_store.playlist_type(),
        );
        self.recheck_player_state();
    }

    fn on_regular_tick(&mut self) {
        let wanted_pos = self.media_element_ref.wanted_position();
        self.last_position = wanted_pos;

        // Lock `Requester`, so it only do new segment requests when every
        // wanted segments is scheduled - for better priorization
        let was_already_locked = self.requester.lock_segment_requests();
        self.requester.update_base_position(Some(wanted_pos));
        self.segment_selectors.advance_position(wanted_pos - 0.2);

        self.check_segments_to_request();
        if !was_already_locked {
            self.requester.unlock_segment_requests();
        }

        if self.media_element_ref.is_rebuffering() {
            match self.next_scheduled_segment_start() {
                None => {}
                Some(val) => {
                    let buffer_gap = self.media_element_ref.last_buffer_gap();
                    if wanted_pos + buffer_gap < val {
                        Logger::warn(&format!(
                            "Core: Found a skippable discontinuity (p:{}, bg:{}, n:{})",
                            wanted_pos, buffer_gap, val
                        ));
                        self.media_element_ref.seek(val + 0.01);
                    }
                }
            };
        }
    }

    fn next_scheduled_segment_start(&self) -> Option<f64> {
        let wanted_pos = self.media_element_ref.wanted_position();
        let req_min = self.requester.earliest_media_segment_pending();
        let mut seg_min = None;
        [MediaType::Video, MediaType::Audio]
            .into_iter()
            .for_each(|mt| {
                let inventory = self.media_element_ref.inventory(mt);
                let next_segment = inventory
                    .iter()
                    .find(|s| s.last_buffered_end() > wanted_pos);
                if let Some(seg) = next_segment {
                    seg_min = Some(
                        seg_min
                            .map(|m| f64::max(m, seg.last_buffered_start()))
                            .unwrap_or(seg.last_buffered_start()),
                    );
                }
            });
        match (req_min, seg_min) {
            (None, None) => None,
            (Some(rm), None) => Some(rm),
            (None, Some(sm)) => Some(sm),
            (Some(rm), Some(sm)) => Some(f64::min(rm, sm)),
        }
    }

    /// Actions to perform once a seek has been performed on the media element.
    fn on_seek(&mut self) {
        let wanted_pos = self.media_element_ref.wanted_position();
        self.segment_selectors
            .restart_from_position(wanted_pos - 0.2);

        self.requester.lock_segment_requests();
        self.requester.update_base_position(Some(wanted_pos));
        self.check_requested_segments_still_needed();
        self.check_segments_to_request();
        self.requester.unlock_segment_requests();
    }

    /// Check that all pending initialization and media requests still correspond to the most
    /// needed segments.
    ///
    /// If not, abort the corresponding pending requests.
    ///
    /// This method is intended to be called on exceptional events which may have led to a
    /// potential change of segment priorization, such as a seek.
    fn check_requested_segments_still_needed(&mut self) {
        [MediaType::Audio, MediaType::Video]
            .into_iter()
            .for_each(|mt| {
                let Some(pl_store) = self.playlist_store.as_ref() else {
                    self.abort_segment_requests_with_type(mt);
                    return;
                };

                let inventory = self.media_element_ref.inventory(mt);
                if let Some(seg_info) = pl_store.curr_media_playlist_segment_info(mt) {
                    let needed_segment = self.segment_selectors.get_mut(mt).most_needed_segment(
                        seg_info.0,
                        &seg_info.1,
                        inventory,
                    );

                    if let Some(i) = needed_segment.init_segment() {
                        if !self
                            .requester
                            .is_requesting_segment(mt, i.url(), i.byte_range())
                        {
                            Logger::debug(&format!(
                                "Core: {mt} init segment request not needed anymore, abort."
                            ));
                            self.abort_segment_requests_with_type(mt);
                        } else {
                            Logger::debug(&format!(
                                "Core: {mt} init segment request still needed."
                            ));
                        }
                    } else if let Some(seg) = needed_segment.media_segment() {
                        if !self
                            .requester
                            .is_requesting_segment(mt, seg.url(), seg.byte_range())
                        {
                            Logger::debug(&format!(
                                "Core: {mt} media segment request not needed anymore, abort."
                            ));
                            self.abort_segment_requests_with_type(mt);
                        } else {
                            Logger::debug(&format!(
                                "Core: {mt} media segment request still needed."
                            ));
                        }
                    } else {
                        self.abort_segment_requests_with_type(mt);
                    }
                }
            });
    }

    fn check_segment_to_request_for_type(&mut self, media_type: MediaType) {
        let Some(pl_store) = self.playlist_store.as_ref() else {
            return;
        };
        if !self.requester.has_segment_request_pending(media_type) {
            let inventory = self.media_element_ref.inventory(media_type);
            if let Some(seg_info) = pl_store.curr_media_playlist_segment_info(media_type) {
                let most_needed_segment = self
                    .segment_selectors
                    .get_mut(media_type)
                    .most_needed_segment(seg_info.0, &seg_info.1, inventory);
                if let Some(i) = most_needed_segment.init_segment() {
                    let req_id =
                        self.segment_request_contexts
                            .insert(PendingSegmentRequest::Init {
                                media_type,
                                init_segment_id: i.id(),
                            });
                    self.requester.request_init_segment(
                        media_type,
                        i.url().clone(),
                        i.byte_range(),
                        req_id,
                    );
                } else if let Some(seg) = most_needed_segment.media_segment() {
                    let init_segment_id = seg_info.0.init_for(seg).map(|i| i.id());
                    let req_id =
                        self.segment_request_contexts
                            .insert(PendingSegmentRequest::Media {
                                media_type,
                                time_info: seg.time_info().clone(),
                                init_segment_id,
                                quality_context: seg_info.1,
                                sequence_number: seg.sequence(),
                                discontinuity_sequence: seg.discontinuity_sequence(),
                            });
                    self.requester
                        .request_media_segment(media_type, seg, req_id);
                }
            }
        }
    }

    /// Perform all actions that should be commonly taken after the current variant changes.
    fn handle_variant_update(&mut self, result: VariantUpdateResult, flush: bool) {
        let (changed_media_types, has_worsened) = match result {
            VariantUpdateResult::Improved(mt) => (mt, false),
            VariantUpdateResult::EqualOrUnknown(mt) => (mt, false),
            VariantUpdateResult::Worsened(mt) => (mt, true),
            VariantUpdateResult::Unchanged => {
                return;
            }
        };

        self.handle_media_playlist_update(&changed_media_types, flush || has_worsened, flush);
        if let Some(pl_store) = self.playlist_store.as_mut() {
            jsAnnounceVariantUpdate(pl_store.curr_variant().map(|v| v.id()));
        }
    }

    /// Perform all actions that should be commonly taken after one or multiple of the current Media
    /// Playlists change.
    fn handle_media_playlist_update(
        &mut self,
        changed_media_types: &[MediaType],
        abort_prev: bool,
        flush: bool,
    ) {
        if self.playlist_store.is_none() {
            return;
        }

        for mt in changed_media_types.iter().copied() {
            Logger::info(&format!("Core: {} MediaPlaylist changed", mt));
            self.ready_probe_segments.clear_media_type(mt);

            if abort_prev {
                self.abort_segment_requests_with_type(mt);
            }
            if flush {
                if let Err(e) = self.media_element_ref.flush(mt) {
                    Logger::warn(&format!(
                        "Could not remove data from the previous {mt} buffer: {}",
                        e
                    ));
                }
                self.segment_selectors
                    .get_mut(mt)
                    .restart_from_position(self.media_element_ref.wanted_position() - 0.2);
            }

            let playlist_to_fetch = self.playlist_store.as_ref().and_then(|pl_store| {
                if pl_store.curr_media_playlist(mt).is_some() {
                    None
                } else {
                    let id = *pl_store.curr_media_playlist_id(mt)?;
                    let url = pl_store.media_playlist_url(&id)?.clone();
                    Some((id, url))
                }
            });

            if let Some((id, url)) = playlist_to_fetch {
                use PlaylistFileType::*;
                Logger::debug("Core: Media changed, requesting its media playlist");
                self.requester
                    .fetch_playlist(url, MediaPlaylist { id, media_type: mt });
            }
        }

        if !changed_media_types.is_empty() {
            self.clean_up_playlist_refresh_timers();
        }
        self.check_segments_to_request();
    }

    /// Method called once a segment request ended with success
    fn on_segment_fetch_success(
        &mut self,
        segment_req: SegmentRequestInfo,
        result: JsMemoryBlob,
        resource_size: u32,
        duration_ms: f64,
    ) {
        Logger::lazy_info(&|| {
            let lane_label = segment_req.lane_tag().label();
            match segment_req.time_info() {
                None => format!("Loaded {} init segment", lane_label),
                Some(time_info) => format!(
                    "Loaded {} segment: t: {}, d: {}",
                    lane_label,
                    time_info.start(),
                    time_info.duration()
                ),
            }
        });

        self.adaptive_selector
            .add_metric(duration_ms, resource_size);

        let media_type = segment_req.media_type();
        let Some(req_ctxt) = self.segment_request_contexts.take(segment_req.id()) else {
            Logger::warn("Loaded segment with unknown pending context.");
            return;
        };

        match req_ctxt {
            PendingSegmentRequest::Media {
                media_type: req_media_type,
                init_segment_id,
                time_info,
                quality_context,
                sequence_number,
                discontinuity_sequence,
                ..
            } => {
                if Some(req_media_type) != media_type {
                    Logger::warn("Loaded media segment with mismatched media type context.");
                }
                self.on_media_segment_loaded(SegmentPushMetadata {
                    data: result,
                    media_type: req_media_type,
                    init_segment_id,
                    time_info,
                    context: quality_context,
                    sequence_number,
                    discontinuity_sequence,
                });
            }
            PendingSegmentRequest::Init {
                media_type: req_media_type,
                init_segment_id,
            } => {
                if Some(req_media_type) != media_type {
                    Logger::warn("Loaded init segment with mismatched media type context.");
                }
                self.on_init_segment_loaded(result, req_media_type, init_segment_id);
            }
            PendingSegmentRequest::Probe {
                probe_segment,
                requested_media_type,
            } => {
                self.do_probe_segment_inspection(probe_segment, requested_media_type, result);
                self.recheck_player_state();
            }
        }
    }

    fn on_media_segment_loaded(&mut self, push_md: SegmentPushMetadata) {
        let segment_start = push_md.time_info.start();
        let segment_end = push_md.time_info.end();
        let media_type = push_md.media_type;
        let prepared_data = self
            .media_element_ref
            .announce_incoming_media_segment(push_md);

        // Check next segment BEFORE actually pushing, as the pushing operation could take in the
        // tens of ms or even in the hundreds depending on segment size and platform performance.
        //
        // We still announce the incoming segment first to ensure the `MediaElementReference`'s
        // inventory is up-to-date.
        self.check_best_variant();
        self.segment_selectors
            .get_mut(media_type)
            .validate_media_until(segment_end);
        self.check_segments_to_request();

        match self
            .media_element_ref
            .push_media_segment(media_type, prepared_data)
        {
            Err(x) => {
                let media_type = x.media_type();
                let message = x.to_string();
                jsSendSegmentParsingError(true, x.into(), Some(media_type), &message);
                self.stop_current_content();
            }
            Ok(()) => {
                if utils::was_last_segment(self.playlist_store.as_ref(), media_type, segment_start)
                {
                    Logger::info(&format!(
                        "Last {} segment request finished, declaring its buffer's end",
                        media_type
                    ));
                    self.media_element_ref.end_buffer(media_type);
                }
            }
        }
    }

    fn on_init_segment_loaded(&mut self, data: JsMemoryBlob, media_type: MediaType, init_id: f64) {
        match self.media_element_ref.push_init_segment(media_type, data) {
            Err(x) => {
                let media_type = x.media_type();
                let message = x.to_string();
                jsSendSegmentParsingError(true, x.into(), Some(media_type), &message);
                self.stop_current_content();
            }
            Ok(()) => self
                .segment_selectors
                .get_mut(media_type)
                .validate_init(init_id),
        }

        self.check_best_variant();
        self.check_segments_to_request();
    }

    fn abort_segment_requests_with_type(&mut self, media_type: MediaType) {
        let aborted_reqs = self.requester.abort_segments_with_type(media_type);
        for req_id in aborted_reqs {
            if let Some(media_type) = self
                .segment_request_contexts
                .take(req_id)
                .and_then(|ctxt| ctxt.requested_media_type())
            {
                self.ready_probe_segments.clear_media_type(media_type);
            }
        }
    }

    /// Removes from `self.playlist_refresh_timers` timers for playlist that are not current
    /// anymore and abort their corresponding timers
    fn clean_up_playlist_refresh_timers(&mut self) {
        if let Some(ref pl_store) = self.playlist_store {
            self.playlist_refresh_timers
                .retain(|id| pl_store.is_curr_media_playlist(id))
        } else {
            self.playlist_refresh_timers.clear_all_timers();
        }
    }
}
