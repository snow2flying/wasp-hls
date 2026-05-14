use crate::{
    bindings::{jsIsTypeSupported, MediaType, PlaylistNature},
    media_element::SegmentQualityContext,
    parser::{
        AudioTrack, DirectMediaInfo, MediaPlaylist, MediaPlaylistUpdateError, SegmentList,
        SegmentTimeInfo, TopLevelPlaylist, VariantStream,
    },
    utils::url::Url,
    Logger,
};
use std::{cmp::Ordering, collections::HashMap, io::BufRead};

use crate::parser::ByteRange;
pub(crate) use crate::parser::MediaPlaylistPermanentId;

#[derive(Clone, Debug)]
pub(crate) struct ProbeSegmentMetadata {
    /// The URL to that segment.
    pub(crate) url: Url,
    /// The optional byte-range to that segment.
    pub(crate) byte_range: Option<ByteRange>,
    // Supplementary context information about that probe segment
    pub(crate) context: ProbeSegmentContext,
}

// Supplementary context information about a segment used for "probing"
#[derive(Clone, Debug)]
pub(crate) enum ProbeSegmentContext {
    /// This probe segment is a full valid initialization segment
    Init { id: f64 },
    /// This probe segment is a full valid Media segment
    Media {
        /// Sequence number identifying that segment in the playlist.
        sequence: u32,
        /// Discontinuity sequence associated with that segment in the playlist.
        discontinuity_sequence: u32,
        /// Timing information linked to that media segment
        time_info: SegmentTimeInfo,
    },
}

/// State associated with the initial setup of the top-level playlist (either the
/// Multivariant playlist or a direct media playlist).
///
/// That setup is complexified by the need to know which and if media announced in those
/// playlists are supported, which can necessitate a segment request and other async API
/// calls.
pub(crate) enum StartupStatus {
    /// A "probe segment" must be loaded and inspected for supplementary
    /// playlist information before playback can start.
    ///
    /// Once the supplementary information is extracted, is should be communicated to the
    /// `PlaylistStore` (e.g. through `set_direct_media_info`).
    ///
    /// The second value of that tuple is either:
    ///
    /// - `Some(media_type)` where `media_type` is the corresponding known media type of
    ///   the corresponding active playlist.
    ///
    /// - `None` if the `MediaType` isn't known or is not important (e.g. Direct Media
    ///   Playlist cases)
    NeedsProbes(Vec<(ProbeSegmentMetadata, Option<MediaType>)>),
    /// Codecs are currently in their way to be checked by the platform.
    ///
    /// Once known, it should be communicated back to the `PlaylistStore`.
    AwaitingSupportCheck,
    /// The currently selected startup variant is unsupported and another one should be selected.
    VariantSwitchNeeded { variant_id: u32 },
    /// The top level playlist can now be fully exploited for playback.
    Ready,
}

enum MultivariantStartupStatus {
    AwaitingSupportCheck,
    VariantSwitchNeeded { variant_id: u32 },
    Ready,
}

#[derive(Default)]
struct ProbedMediaInfo {
    audio: Option<DirectMediaInfo>,
    video: Option<DirectMediaInfo>,
}

/// Stores information about the current loaded Multivariant Playlist and its sub-playlists:
///   - Information on the Multivariant Playlist itself.
///   - On the current variant selected.
///   - Information on the different audio and video Media Playlists selected.
pub(crate) struct PlaylistStore {
    /// Representation of the top-level playlist of the currently loaded HLS content.
    playlist: TopLevelPlaylist,

    /// `id` of the currently chosen variant.
    /// `None` if the current content does not rely on variants (e.g. when playing
    /// Media Playlists directly)
    curr_variant_id: Option<u32>,

    /// Chosen playlist for video.
    ///
    /// Also concerns playlist containing both audio and video.
    ///
    /// Set to `None` if no video playlist is chosen.
    curr_video_id: Option<MediaPlaylistPermanentId>,

    /// Chosen playlist for audio.
    ///
    /// Set to `None` if no audio playlist is chosen.
    curr_audio_id: Option<MediaPlaylistPermanentId>,

    /// `id` identifier for the currently-selected audio track. `None` if no audio track is
    /// explicitely selected.
    ///
    /// Note that unlike `curr_video_id` and `curr_audio_id`, this identifier is not linked to a
    /// Playlist but to the `id` of the track itself.
    curr_audio_track: Option<u32>,

    /// If `true` a variant is being manually locked and as such, cannot change.
    is_variant_locked: bool,

    /// Store the last communicated bandwidth
    last_bandwidth: f64,

    /// Before actually playing a multivariant content, supported codecs need to be checked
    /// to avoid mistakenly choosing an unsupported variant.
    ///
    /// This bool is set to `true` once the currently selected media has had its support
    /// resolved.
    multivariant_support_resolved: bool,

    /// Runtime support cache for variants in the current multivariant playlist.
    /// Key is the variant id, bool is `true` if supported, `false` if not.
    variant_support: HashMap<u32, bool>,

    /// Probe metadata inferred for currently known multivariant media playlists.
    /// XXX TODO: If it's per-media playlist, why would it be needed to separate audio and
    /// video? Aren't both in the same segment anyway? In that case, isn't `isTypeSupported` and
    /// `addSourceBuffer` supposed to accept both at once?
    multivariant_media_info: HashMap<MediaPlaylistPermanentId, ProbedMediaInfo>,
}

impl PlaylistStore {
    /// Create a new `PlaylistStore` based on the given parsed `MultivariantPlaylist`.
    ///
    /// Automatically selects the variant with the highest quality (or score if defined) on call.
    /// Please call `update_curr_bandwidth` to select a variant based on an actual criteria.
    pub(crate) fn try_new(
        playlist: TopLevelPlaylist,
        initial_bandwidth: f64,
    ) -> Result<Self, PlaylistStoreError> {
        Logger::debug(&format!(
            "PS: Creating new PlaylistStore (bw: {initial_bandwidth})"
        ));
        let (curr_variant_id, curr_audio_id, curr_video_id) = match &playlist {
            TopLevelPlaylist::Multivariant(playlist) => {
                let variants = playlist.all_variants();

                let initial_variant = if let Some(variant_id) =
                    best_variant_id(variants.iter(), initial_bandwidth)
                {
                    playlist.variant(variant_id).unwrap()
                } else if let Some(variant_id) = fallback_variant_id(variants.iter()) {
                    Logger::info("PS: Found no bandwidth-compatible variant amongst all variants");
                    playlist.variant(variant_id).unwrap()
                } else {
                    Logger::error("PS: Found no variant in the given MultivariantPlaylist");
                    return Err(PlaylistStoreError::NoInitialVariant);
                };

                (
                    Some(initial_variant.id()),
                    playlist.audio_media_playlist_id_for(initial_variant, None),
                    playlist.video_media_playlist_id_for(initial_variant),
                )
            }
            TopLevelPlaylist::DirectMedia(_) => (None, None, None),
        };

        Ok(Self {
            playlist,
            curr_variant_id,
            curr_audio_id,
            curr_video_id,
            curr_audio_track: None,
            is_variant_locked: false,
            last_bandwidth: 0.,
            multivariant_support_resolved: false,
            variant_support: HashMap::new(),
            multivariant_media_info: HashMap::new(),
        })
    }

    /// Returns a reference to the `Url` to the Multivariant Playlist stored by this
    /// `PlaylistStore`.
    pub(crate) fn url(&self) -> &Url {
        self.playlist.url()
    }

    /// Returns which kind of Top-level Playlist we're relying on currently (either
    /// a MultiVariant Playlist or a direct Media Playlist one)
    pub(crate) fn playlist_kind(&self) -> crate::bindings::PlaylistType {
        match &self.playlist {
            TopLevelPlaylist::Multivariant(_) => {
                crate::bindings::PlaylistType::MultivariantPlaylist
            }
            TopLevelPlaylist::DirectMedia(_) => crate::bindings::PlaylistType::MediaPlaylist,
        }
    }

    /// Resolve which variants in the `MultivariantPlaylist` are supported.
    ///
    /// This allows the playlist store to know which variant can actually be relied on before
    /// playback starts.
    ///
    /// Returns `true` if support for every relevant variant could be resolved or `false` if it is
    /// still awaiting a response from JavaScript. As that response can be asynchronous it is given
    /// back to the corresponding Dispatcher's event listener function.
    ///
    /// Once that event listener has been called, `resolve_multivariant_support` can be called
    /// again, until it returns `true`.
    fn resolve_multivariant_support(
        &mut self,
    ) -> Result<MultivariantStartupStatus, PlaylistStoreError> {
        if self.multivariant_support_resolved {
            return Ok(MultivariantStartupStatus::Ready);
        }

        let curr_variant_id = self.curr_variant_id;
        let curr_audio_required = self.curr_audio_id.is_some();
        let curr_video_required = self.curr_video_id.is_some();
        let inferred_audio_codec = self
            .curr_multivariant_media_info(MediaType::Audio)
            .map(|i| i.codec.clone());
        let inferred_video_codec = self
            .curr_multivariant_media_info(MediaType::Video)
            .map(|i| i.codec.clone());

        let playlist = match &self.playlist {
            TopLevelPlaylist::Multivariant(playlist) => playlist,
            TopLevelPlaylist::DirectMedia(_) => {
                return Ok(MultivariantStartupStatus::Ready);
            }
        };

        let mut current_variant_resolved = true;
        let mut support_updates = Vec::new();
        'variant: for v in playlist.all_variants() {
            // If support was already determined for this variant, reuse it.
            if self.variant_support(v.id()).is_some() {
                continue;
            }

            let mut variant_is_supported = false;
            let is_current_variant = Some(v.id()) == curr_variant_id;
            let mut saw_codec = false;

            for mt in [MediaType::Video, MediaType::Audio] {
                let codec = v.codecs(mt).or_else(|| {
                    if is_current_variant {
                        match mt {
                            MediaType::Audio => inferred_audio_codec.clone(),
                            MediaType::Video => inferred_video_codec.clone(),
                        }
                    } else {
                        None
                    }
                });

                let Some(codec) = codec else {
                    let media_required = is_current_variant
                        && match mt {
                            MediaType::Audio => curr_audio_required,
                            MediaType::Video => curr_video_required,
                        };
                    if media_required {
                        current_variant_resolved = false;
                        continue 'variant;
                    }
                    continue;
                };
                saw_codec = true;

                match jsIsTypeSupported(mt, &codec) {
                    Some(false) => {
                        support_updates.push((v.id(), false));
                        continue 'variant;
                    }
                    Some(true) => variant_is_supported = true,
                    None => {
                        if is_current_variant {
                            current_variant_resolved = false;
                        }
                        continue 'variant;
                    }
                }
            }

            if variant_is_supported {
                support_updates.push((v.id(), true));
            } else if is_current_variant && !saw_codec {
                current_variant_resolved = false;
            }
        }

        support_updates
            .into_iter()
            .for_each(|(variant_id, supported)| self.set_variant_support(variant_id, supported));

        let curr_variant_id = self.curr_variant_id.unwrap();
        let curr_variant_support = self.variant_support(curr_variant_id);

        if curr_variant_support == Some(false) {
            if let Some(variant_id) = self.next_best_variant_id() {
                self.multivariant_support_resolved = false;
                return Ok(MultivariantStartupStatus::VariantSwitchNeeded { variant_id });
            } else {
                Logger::error("PS: No supported variant in the given MultivariantPlaylist");
                return Err(PlaylistStoreError::NoSupportedVariant);
            }
        }

        let is_multivariant_support_resolved =
            current_variant_resolved && curr_variant_support == Some(true);

        self.multivariant_support_resolved = is_multivariant_support_resolved;

        if is_multivariant_support_resolved {
            Logger::info("PS: Support has been resolved for the current multivariant startup path");
        } else {
            Logger::info("PS: Current multivariant startup path still needs support resolution");
        }
        if is_multivariant_support_resolved {
            Ok(MultivariantStartupStatus::Ready)
        } else {
            Ok(MultivariantStartupStatus::AwaitingSupportCheck)
        }
    }

    /// Returns the list of tuples listing loaded media playlists.
    ///
    /// The tuples are defined as such:
    ///   - first, the `MediaType`, each `MediaType` can be in the array only once at most.
    ///   - Second, a reference to the parsed `MediaPlaylist`
    pub(crate) fn curr_media_playlists(&self) -> Vec<(MediaType, &MediaPlaylist)> {
        let mut ret = vec![];
        if let Some(pl) = self.curr_media_playlist(MediaType::Audio) {
            ret.push((MediaType::Audio, pl));
        }
        if let Some(pl) = self.curr_media_playlist(MediaType::Video) {
            ret.push((MediaType::Video, pl));
        }
        ret
    }

    // TODO: This one is ugly, remove
    pub(crate) fn direct_media_playlist(
        &self,
    ) -> Option<(&MediaPlaylistPermanentId, &MediaPlaylist)> {
        match &self.playlist {
            TopLevelPlaylist::DirectMedia(playlist) => Some((playlist.id(), playlist.playlist())),
            TopLevelPlaylist::Multivariant(_) => None,
        }
    }

    pub(crate) fn is_curr_media_playlist(&self, id: &MediaPlaylistPermanentId) -> bool {
        Some(id) == self.curr_audio_id.as_ref() || Some(id) == self.curr_video_id.as_ref()
    }

    /// Returns the `MediaType` currently associated to the given Media Playlist id.
    ///
    /// Returns `None` when that playlist is not one of the currently-selected media playlists.
    pub(crate) fn curr_media_type_for(&self, id: &MediaPlaylistPermanentId) -> Option<MediaType> {
        if Some(id) == self.curr_video_id.as_ref() {
            Some(MediaType::Video)
        } else if Some(id) == self.curr_audio_id.as_ref() {
            Some(MediaType::Audio)
        } else {
            None
        }
    }

    /// Returns `true` if the current playlist linked to the given `MediaType` has been loaded.
    ///
    /// Returns `false` either if it has not been loaded yet or if there's no media playlist for
    /// that `MediaType`.
    /// You can call `has_media_type` to know if there's a playlist to load for a given
    /// `MediaType`.
    fn is_media_playlist_ready(&self, media_type: MediaType) -> bool {
        self.curr_media_playlist(media_type).is_some()
    }

    /// Returns `true` only if all media playlists currently selected have been loaded.
    pub(crate) fn are_playlists_ready(&self) -> bool {
        [MediaType::Audio, MediaType::Video]
            .into_iter()
            .all(|t| !self.has_media_type(t) || self.is_media_playlist_ready(t))
    }

    /// Returns true if a MediaPlaylist for the given `MediaType` has been selected, regardless if
    /// that playlist has been loaded or not.
    pub(crate) fn has_media_type(&self, media_type: MediaType) -> bool {
        match media_type {
            MediaType::Audio => self.curr_audio_id.is_some(),
            MediaType::Video => self.curr_video_id.is_some(),
        }
    }

    /// Initialize or update a `MediaPlaylist`, based on its `MediaPlaylistPermanentId`.
    pub(crate) fn update_media_playlist(
        &mut self,
        id: &MediaPlaylistPermanentId,
        media_playlist_data: impl BufRead,
        url: Url,
    ) -> Result<&MediaPlaylist, MediaPlaylistUpdateError> {
        match &mut self.playlist {
            TopLevelPlaylist::Multivariant(playlist) => {
                playlist.update_media_playlist(id, media_playlist_data, url)
            }
            TopLevelPlaylist::DirectMedia(playlist) => {
                playlist.update_media_playlist(id, media_playlist_data, url)
            }
        }
    }

    pub(crate) fn current_codec(&self, media_type: MediaType) -> Option<String> {
        match &self.playlist {
            TopLevelPlaylist::Multivariant(_) => self
                .curr_multivariant_media_info(media_type)
                .map(|info| info.codec.clone())
                .or_else(|| self.curr_variant()?.codecs(media_type)),
            TopLevelPlaylist::DirectMedia(playlist) => playlist
                .external_media_info()
                .filter(|info| info.media_type == media_type)
                .map(|info| info.codec.clone()),
        }
    }

    pub(crate) fn current_mime_type(&self, media_type: MediaType) -> Option<String> {
        match &self.playlist {
            TopLevelPlaylist::Multivariant(_) => self
                .curr_multivariant_media_info(media_type)
                .map(|info| info.mime_type.clone())
                .or_else(|| {
                    self.curr_media_playlist(media_type)
                        .map(|playlist| playlist.mime_type(media_type).unwrap_or("").to_string())
                }),
            TopLevelPlaylist::DirectMedia(playlist) => playlist
                .external_media_info()
                .filter(|info| info.media_type == media_type)
                .map(|info| info.mime_type.clone()),
        }
    }

    /// Returns the next startup action required before playback can begin.
    ///
    /// This first ensures that enough stream metadata is known for the currently selected startup
    /// path. Once that metadata is complete, it resolves whether the selected startup streams are
    /// actually supported by the current environment.
    pub(crate) fn startup_status(
        &mut self,
        wanted_position: f64,
    ) -> Result<StartupStatus, PlaylistStoreError> {
        match &self.playlist {
            TopLevelPlaylist::DirectMedia(playlist) => {
                if playlist.external_media_info().is_none() {
                    return self
                        .next_direct_media_probe(wanted_position)
                        .map(|probe_segment| {
                            StartupStatus::NeedsProbes(vec![(probe_segment, None)])
                        })
                        .ok_or(PlaylistStoreError::NoProbeSegment);
                }
            }
            TopLevelPlaylist::Multivariant(_) => {
                let probe_requests = [MediaType::Audio, MediaType::Video]
                    .into_iter()
                    .filter(|media_type| {
                        self.has_media_type(*media_type)
                            && self.current_codec(*media_type).is_none()
                    })
                    .map(|media_type| {
                        self.next_media_playlist_probe(media_type, wanted_position)
                            .map(|probe_segment| (probe_segment, Some(media_type)))
                    })
                    .collect::<Option<Vec<_>>>()
                    .ok_or(PlaylistStoreError::NoProbeSegment)?;
                if !probe_requests.is_empty() {
                    return Ok(StartupStatus::NeedsProbes(probe_requests));
                }
            }
        }

        match &self.playlist {
            TopLevelPlaylist::DirectMedia(playlist) => {
                let media_info = playlist.external_media_info().unwrap();
                match jsIsTypeSupported(media_info.media_type, &media_info.codec) {
                    Some(true) => Ok(StartupStatus::Ready),
                    Some(false) => Err(PlaylistStoreError::UnsupportedStartupStream),
                    None => Ok(StartupStatus::AwaitingSupportCheck),
                }
            }
            TopLevelPlaylist::Multivariant(_) => match self.resolve_multivariant_support()? {
                MultivariantStartupStatus::Ready => Ok(StartupStatus::Ready),
                MultivariantStartupStatus::AwaitingSupportCheck => {
                    Ok(StartupStatus::AwaitingSupportCheck)
                }
                MultivariantStartupStatus::VariantSwitchNeeded { variant_id } => {
                    Ok(StartupStatus::VariantSwitchNeeded { variant_id })
                }
            },
        }
    }

    pub(crate) fn set_direct_media_info(&mut self, media_info: DirectMediaInfo) {
        match &mut self.playlist {
            TopLevelPlaylist::DirectMedia(playlist) => {
                let direct_media_id = *playlist.id();
                match media_info.media_type {
                    MediaType::Audio => {
                        self.curr_audio_id = Some(direct_media_id);
                        self.curr_video_id = None;
                    }
                    MediaType::Video => {
                        self.curr_audio_id = None;
                        self.curr_video_id = Some(direct_media_id);
                    }
                }
                playlist.set_external_media_info(media_info);
            }
            TopLevelPlaylist::Multivariant(_) => {}
        }
    }

    // XXX TODO: Maybe this can be merged with the direct media one? We have enough
    // context here
    pub(crate) fn set_multivariant_media_info(
        &mut self,
        media_type: MediaType,
        media_info: DirectMediaInfo,
    ) {
        let wanted_id = match media_type {
            MediaType::Audio => self.curr_audio_id.as_ref(),
            MediaType::Video => self.curr_video_id.as_ref(),
        };
        let Some(wanted_id) = wanted_id else {
            return;
        };
        let entry = self.multivariant_media_info.entry(*wanted_id).or_default();
        match media_type {
            MediaType::Audio => entry.audio = Some(media_info),
            MediaType::Video => entry.video = Some(media_info),
        }
    }

    /// Returns probe segment metadata for a direct Media Playlist associated to
    /// the `wanted_position` if it exists.
    fn next_direct_media_probe(&self, wanted_position: f64) -> Option<ProbeSegmentMetadata> {
        let playlist = match &self.playlist {
            TopLevelPlaylist::DirectMedia(playlist) => playlist.playlist(),
            TopLevelPlaylist::Multivariant(_) => return None,
        };
        Self::probe_for_media_playlist(playlist, wanted_position)
    }

    /// Returns probe segment metadata for a non-direct Media Playlist associated to
    /// the `wanted_position` if it exists.
    fn next_media_playlist_probe(
        &self,
        media_type: MediaType,
        wanted_position: f64,
    ) -> Option<ProbeSegmentMetadata> {
        let playlist = self.curr_media_playlist(media_type)?;
        Self::probe_for_media_playlist(playlist, wanted_position)
    }

    /// Get probe segment for the given media playlist and preferred position.
    fn probe_for_media_playlist(
        playlist: &MediaPlaylist,
        wanted_position: f64,
    ) -> Option<ProbeSegmentMetadata> {
        let media_segment = playlist
            .segment_list()
            .segment_from_pos(wanted_position)
            .or_else(|| playlist.segment_list().media().first())?;
        if let Some(init_segment) = playlist.segment_list().init_for(media_segment) {
            Some(ProbeSegmentMetadata {
                url: init_segment.url().clone(),
                byte_range: init_segment.byte_range().cloned(),
                context: ProbeSegmentContext::Init {
                    id: init_segment.id(),
                },
            })
        } else {
            Some(ProbeSegmentMetadata {
                url: media_segment.url().clone(),
                byte_range: media_segment.byte_range().cloned(),
                context: ProbeSegmentContext::Media {
                    sequence: media_segment.sequence(),
                    discontinuity_sequence: media_segment.discontinuity_sequence(),
                    time_info: media_segment.time_info().clone(),
                },
            })
        }
    }

    /// Returns vec describing all variant streams in the current `MultivariantPlaylist`,
    /// excluding variants known to be unsupported.
    pub(crate) fn available_variants(&self) -> Vec<&VariantStream> {
        match &self.playlist {
            TopLevelPlaylist::Multivariant(playlist) => playlist
                .all_variants()
                .iter()
                .filter(|v| self.variant_support(v.id()) != Some(false))
                .collect(),
            TopLevelPlaylist::DirectMedia(_) => vec![],
        }
    }

    /// Returns vec describing all available variant streams in the current MultivariantPlaylist.
    pub(crate) fn supported_variants(&self) -> Vec<&VariantStream> {
        match &self.playlist {
            TopLevelPlaylist::Multivariant(playlist) => playlist
                .all_variants()
                .iter()
                .filter(|v| self.variant_support(v.id()) == Some(true))
                .collect(),
            TopLevelPlaylist::DirectMedia(_) => vec![],
        }
    }

    /// Returns vec describing all non-rejected variants compatible with the current track choice.
    fn selectable_variants_for_curr_track(&self) -> Vec<&VariantStream> {
        match &self.playlist {
            TopLevelPlaylist::Multivariant(playlist) => {
                if let Some(track_id) = self.curr_audio_track {
                    // There's an explicitly set audio track id, get variants linked to it
                    playlist
                        .variants_for_audio(track_id)
                        .into_iter()
                        .filter(|v| self.variant_support(v.id()) != Some(false))
                        .collect()
                } else if let Some(track_id) = self.curr_audio_track_id() {
                    // Else do in function of the current audio track
                    playlist
                        .variants_for_audio(track_id)
                        .into_iter()
                        .filter(|v| self.variant_support(v.id()) != Some(false))
                        .collect()
                } else {
                    // No current audio track: choose from anything
                    playlist
                        .all_variants()
                        .iter()
                        .filter(|v| self.variant_support(v.id()) != Some(false))
                        .collect()
                }
            }
            TopLevelPlaylist::DirectMedia(_) => vec![],
        }
    }

    /// Estimates the duration of the current content based on the currently selected audio and
    /// video media playlists.
    ///
    /// Returns `None` if there's not enough data to produce that estimate (e.g. no audio or video
    /// media playlist selected or they are not loaded).
    pub(crate) fn curr_duration(&self) -> Option<f64> {
        let audio_duration = self
            .curr_media_playlist(MediaType::Audio)
            .and_then(|a| a.ending());
        let video_duration = self
            .curr_media_playlist(MediaType::Video)
            .and_then(|v| v.ending());
        match (audio_duration, video_duration) {
            (None, None) => None,
            (Some(a), Some(v)) => Some(f64::min(a, v)),
            (Some(a), None) => Some(a),
            (None, Some(v)) => Some(v),
        }
    }

    pub(crate) fn segment_target_duration(&self) -> Option<f64> {
        let audio_td = self
            .curr_media_playlist(MediaType::Audio)
            .map(|a| a.target_duration());
        let video_td = self
            .curr_media_playlist(MediaType::Video)
            .map(|v| v.target_duration());
        match (audio_td, video_td) {
            (None, None) => None,
            (Some(a), Some(v)) => Some(f64::max(a, v)),
            (Some(a), None) => Some(a),
            (None, Some(v)) => Some(v),
        }
    }

    /// Returns the minimum reachable position seen in the last fetched media playlist.
    ///
    /// This function actually defines the minimum position as the maximum of the
    /// minimum positions reachable through all media playlists.
    ///
    /// Returns `None` if there's not enough data to produce that value (e.g. no audio
    /// or video media playlist selected or they are not loaded).
    pub(crate) fn curr_min_position(&self) -> Option<f64> {
        let audio_duration = self
            .curr_media_playlist(MediaType::Audio)
            .and_then(|a| a.beginning());
        let video_duration = self
            .curr_media_playlist(MediaType::Video)
            .and_then(|v| v.beginning());
        match (audio_duration, video_duration) {
            (None, None) => None,
            (Some(a), Some(v)) => Some(f64::max(a, v)),
            (Some(a), None) => Some(a),
            (None, Some(v)) => Some(v),
        }
    }

    /// Returns the maximum reachable position seen in the last fetched media playlist.
    ///
    /// This function actually defines the maximum position as the minimum of the
    /// maximum positions reachable through all media playlists.
    ///
    /// Returns `None` if there's not enough data to produce that value (e.g. no audio
    /// or video media playlist selected or they are not loaded).
    pub(crate) fn curr_max_position(&self) -> Option<f64> {
        self.curr_duration()
    }

    /// Returns a reference to the `VariantStream` currently selected. You can influence the
    /// variant currently selected by e.g. calling the `update_curr_bandwidth` method.
    pub(crate) fn curr_variant(&self) -> Option<&VariantStream> {
        match (&self.playlist, self.curr_variant_id) {
            (TopLevelPlaylist::Multivariant(playlist), Some(curr_variant_id)) => {
                playlist.variant(curr_variant_id)
            }
            _ => None,
        }
    }

    /// Optionally update currently-selected variant by communicating the last bandwidth estimate.
    ///
    /// Returns a vec of `MediaType` corresponding to the MediaPlaylists that have been in
    /// consequence updated.
    /// Returns an empty vec if this new bandwidth estimate did not have any effect on any selected
    /// MediaPlaylist.
    pub(crate) fn update_curr_bandwidth(&mut self, bandwidth: f64) -> VariantUpdateResult {
        self.last_bandwidth = bandwidth;
        if self.curr_variant_id.is_none() || self.is_variant_locked() {
            VariantUpdateResult::Unchanged
        } else {
            self.update_variant(None)
        }
    }

    /// Force a given variant and prevent it from changing, by communicating its `id`.
    ///
    /// To be able to change again the variant, you can call `lock_variant` again or
    /// you can call the `unlock_variant` method.
    ///
    /// The returned option is `None` if the `variant_id` given is not found to correspond
    /// to any existing variant. It contains the corresponding update when set to the `Some`
    /// variant.
    pub(crate) fn lock_variant(&mut self, variant_id: u32) -> LockVariantResponse {
        if self.curr_variant_id.is_none() {
            return LockVariantResponse::NoVariantWithId;
        }
        let variants = self.selectable_variants_for_curr_track();
        let pos = variants.iter().find(|x| x.id() == variant_id);

        if pos.is_some() {
            self.is_variant_locked = true;
            let prev_track_id = self.curr_audio_track.or_else(|| self.curr_audio_track_id());
            let updates = self.update_variant(Some(variant_id));
            let new_track_id = self.curr_audio_track.or_else(|| self.curr_audio_track_id());
            let audio_track_change = match (prev_track_id, new_track_id) {
                (Some(prev_id), Some(new_id)) => {
                    if prev_id == new_id {
                        Some(new_id)
                    } else {
                        None
                    }
                }
                (None, Some(new_id)) => Some(new_id),
                _ => None,
            };
            LockVariantResponse::VariantLocked {
                updates,
                audio_track_change,
            }
        } else {
            self.is_variant_locked = false;
            LockVariantResponse::NoVariantWithId
        }
    }

    /// Disable a variant lock, previously created through the `lock_variant` method, to
    /// let adaptive streaming choose the right one instead.
    pub(crate) fn unlock_variant(&mut self) -> VariantUpdateResult {
        if self.curr_variant_id.is_none() {
            self.is_variant_locked = false;
            return VariantUpdateResult::Unchanged;
        }
        self.is_variant_locked = false;
        self.update_variant(None)
    }

    /// Returns `true` if a variant is currently locked, preventing adaptive streaming
    /// from choosing the more adapted one. Such lock can be enabled through the
    /// lock_variant` method.
    pub(crate) fn is_variant_locked(&self) -> bool {
        self.is_variant_locked
    }

    /// Returns the `Url` of the MediaPlaylist whose `MediaPlaylistPermanentId` is given in
    /// argument.
    ///
    /// Returns `None` when any of the following is true:
    ///   - The given `MediaPlaylistPermanentId` does not correspond to any known media of
    ///     the content.
    ///   - The given `MediaPlaylistPermanentId` is linked to some media which isn't linked to
    ///     a MediaPlaylist. In that condition, it is the MediaPlaylist linked to its Variant
    ///     stream that should be done.
    ///
    /// Both are probably an error as a `MediaPlaylistPermanentId` should always identify a
    /// `MediaPlaylist`.
    pub(crate) fn media_playlist_url(&self, wanted_id: &MediaPlaylistPermanentId) -> Option<&Url> {
        match &self.playlist {
            TopLevelPlaylist::Multivariant(playlist) => playlist.media_playlist_url(wanted_id),
            TopLevelPlaylist::DirectMedia(playlist) => playlist.media_playlist_url(wanted_id),
        }
    }

    /// Returns the `MediaPlaylistPermanentId` of the MediaPlaylist linked to the media
    /// of the given `MediaType`.
    ///
    /// Returns `None` if there's no choosen MediaPlaylist for the given MediaType.
    pub(crate) fn curr_media_playlist_id(
        &self,
        media_type: MediaType,
    ) -> Option<&MediaPlaylistPermanentId> {
        match media_type {
            MediaType::Video => self.curr_video_id.as_ref(),
            MediaType::Audio => self.curr_audio_id.as_ref(),
        }
    }

    /// Returns a reference to the MediaPlaylist currently loaded for the given `MediaType`.
    ///
    /// Returns `None` either if there's no MediaPlaylist selected for that `MediaType` or if the
    /// MediaPlaylist is not yet loaded.
    pub(crate) fn curr_media_playlist(&self, media_type: MediaType) -> Option<&MediaPlaylist> {
        if let Some(wanted_id) = match media_type {
            MediaType::Video => &self.curr_video_id,
            MediaType::Audio => &self.curr_audio_id,
        } {
            match &self.playlist {
                TopLevelPlaylist::Multivariant(playlist) => playlist.media_playlist(wanted_id),
                TopLevelPlaylist::DirectMedia(playlist) => playlist.media_playlist(wanted_id),
            }
        } else {
            None
        }
    }

    pub(crate) fn curr_media_playlist_segment_info(
        &self,
        media_type: MediaType,
    ) -> Option<(&SegmentList, SegmentQualityContext)> {
        if let Some(wanted_id) = match media_type {
            MediaType::Video => &self.curr_video_id,
            MediaType::Audio => &self.curr_audio_id,
        } {
            self.curr_media_playlist(media_type).map(|m| {
                let score = self
                    .curr_variant()
                    .map(|v| v.score().unwrap_or(v.bandwidth() as f64))
                    .unwrap_or(0.);

                let context = SegmentQualityContext::new(score, wanted_id.as_u32());
                (m.segment_list(), context)
            })
        } else {
            None
        }
    }

    pub(crate) fn playlist_type(&self) -> PlaylistNature {
        let media_playlists = self.curr_media_playlists();
        media_playlists
            .iter()
            .fold(PlaylistNature::Unknown, |acc, p| match acc {
                PlaylistNature::Live => PlaylistNature::Live,
                PlaylistNature::Event => {
                    if p.1.playlist_type() == PlaylistNature::Live {
                        PlaylistNature::Live
                    } else {
                        PlaylistNature::Event
                    }
                }
                PlaylistNature::VoD => match p.1.playlist_type() {
                    PlaylistNature::Live => PlaylistNature::Live,
                    PlaylistNature::Event => PlaylistNature::Event,
                    _ => PlaylistNature::VoD,
                },
                _ => p.1.playlist_type(),
            })
    }

    /// Returns currently estimated start time in seconds at which to begin playing the content.
    ///
    /// This value may change depending on the chosen MediaPlaylist that are also loaded.
    pub(crate) fn expected_start_time(&self) -> f64 {
        let media_playlists = self.curr_media_playlists();
        if media_playlists.is_empty() {
            0.
        } else if media_playlists.iter().all(|p| p.1.is_live()) {
            let initial_dur: Option<f64> = None;
            let min_duration = media_playlists.iter().fold(initial_dur, |acc, p| {
                let duration = p.1.ending();
                if let Some(acc_dur) = acc {
                    if let Some(p_dur) = duration {
                        Some(acc_dur.min(p_dur))
                    } else {
                        Some(acc_dur)
                    }
                } else {
                    duration
                }
            });
            if let Some(min_duration) = min_duration {
                (min_duration - 10.).max(0.)
            } else {
                0.
            }
        } else {
            media_playlists
                .iter()
                .find_map(|p| p.1.wanted_start())
                .unwrap_or(0.)
        }
    }

    /// Returns the `id` of the `AudioTrack` object which is associated to the current audio
    /// media loaded.
    ///
    /// Returns `None` if no current audio media is known currently or if no `AudioTrack` is
    /// linked to it.
    pub(crate) fn curr_audio_track_id(&self) -> Option<u32> {
        match &self.playlist {
            TopLevelPlaylist::Multivariant(playlist) => playlist
                .audio_track_for_media_id(self.curr_audio_id.as_ref()?)
                .map(|p| p.id()),
            TopLevelPlaylist::DirectMedia(_) => None,
        }
    }

    /// Returns the `id` of the `AudioTrack` object explicitely selected through the
    /// `set_audio_track` API.
    ///
    /// Returns `None` if no audio track is currently selected.
    pub(crate) fn selected_audio_track_id(&self) -> Option<u32> {
        self.curr_audio_track
    }

    /// Returns the list of available audio tracks on the current content
    pub(crate) fn audio_tracks(&self) -> &[AudioTrack] {
        match &self.playlist {
            TopLevelPlaylist::Multivariant(playlist) => playlist.audio_tracks(),
            TopLevelPlaylist::DirectMedia(_) => &[],
        }
    }

    /// Explicitely select an `AudioTrack` based on its `id` property or disable the explicit
    /// selection of one (by giving `None` as argument).
    ///
    /// Returns `true` if this call led to a changement for the Audio Media Playlist.
    pub(crate) fn set_audio_track(&mut self, track_id: Option<u32>) -> SetAudioTrackResponse {
        if self.curr_variant_id.is_none() {
            self.curr_audio_track = track_id;
            return SetAudioTrackResponse::NoUpdate;
        }
        self.curr_audio_track = track_id;
        self.clear_variant_supports();

        if let Some(variant) = self.curr_variant() {
            let new_audio_id = match &self.playlist {
                TopLevelPlaylist::Multivariant(playlist) => {
                    playlist.audio_media_playlist_id_for(variant, self.curr_audio_track)
                }
                TopLevelPlaylist::DirectMedia(_) => None,
            };

            if new_audio_id.is_none() && self.curr_audio_id.is_some() {
                // We may be in a case where the choosen track is not available in the
                // current variant, re-check the best variant to have with the new track.
                let old_variant_locked = self.is_variant_locked;
                self.is_variant_locked = false;
                let variant_update = self.update_variant(None);
                SetAudioTrackResponse::VariantUpdate {
                    updates: variant_update,
                    unlocked_variant: old_variant_locked,
                }
            } else if new_audio_id != self.curr_audio_id {
                self.curr_audio_id = new_audio_id;
                SetAudioTrackResponse::AudioMediaUpdate
            } else {
                SetAudioTrackResponse::NoUpdate
            }
        } else {
            SetAudioTrackResponse::NoUpdate
        }
    }

    /// Select the best variant available according to your bandwidth and track choice
    fn update_variant(&mut self, variant_id: Option<u32>) -> VariantUpdateResult {
        let playlist = match &self.playlist {
            TopLevelPlaylist::Multivariant(playlist) => playlist,
            TopLevelPlaylist::DirectMedia(_) => return VariantUpdateResult::Unchanged,
        };
        let new_id = if let Some(id) = variant_id {
            id
        } else {
            let wanted_variants = self.selectable_variants_for_curr_track();
            if let Some(id) = best_variant_id(wanted_variants.into_iter(), self.last_bandwidth) {
                id
            } else if let Some(id) =
                fallback_variant_id(self.selectable_variants_for_curr_track().into_iter())
            {
                Logger::info(
                    "PS: Found no bandwidth-compatible variant amongst selectable variants",
                );
                id
            } else {
                panic!("No variant to choose from. This should be impossible.");
            }
        };
        if Some(new_id) != self.curr_variant_id {
            let prev_bandwidth = self.curr_variant().map(|v| v.bandwidth());
            let new_bandwidth = playlist.variant(new_id).map(|v| v.bandwidth());
            let prev_audio_id = self.curr_audio_id;
            let prev_video_id = self.curr_video_id;
            self.set_curr_variant_and_media_id(new_id.to_owned());

            let mut updates = vec![];
            if self.curr_audio_id != prev_audio_id {
                updates.push(MediaType::Audio);
            }
            if self.curr_video_id != prev_video_id {
                updates.push(MediaType::Video);
            }
            match (prev_bandwidth, new_bandwidth) {
                (Some(p), Some(n)) => match p.cmp(&n) {
                    Ordering::Greater => VariantUpdateResult::Worsened(updates),
                    Ordering::Equal => VariantUpdateResult::EqualOrUnknown(updates),
                    Ordering::Less => VariantUpdateResult::Improved(updates),
                },
                _ => VariantUpdateResult::EqualOrUnknown(updates),
            }
        } else {
            VariantUpdateResult::Unchanged
        }
    }

    /// Internally update the current variant chosen as well as its corresponding other media.
    fn set_curr_variant_and_media_id(&mut self, variant_id: u32) {
        let playlist = match &self.playlist {
            TopLevelPlaylist::Multivariant(playlist) => playlist,
            TopLevelPlaylist::DirectMedia(_) => return,
        };
        let variant = playlist.variant(variant_id).unwrap();
        self.curr_variant_id = Some(variant_id);
        self.curr_video_id = playlist.video_media_playlist_id_for(variant);
        self.curr_audio_id = playlist.audio_media_playlist_id_for(variant, self.curr_audio_track);
        self.multivariant_support_resolved = false;
    }

    fn clear_variant_supports(&mut self) {
        let TopLevelPlaylist::Multivariant(_) = &self.playlist else {
            return;
        };
        self.variant_support.clear();
        self.multivariant_support_resolved = false;
    }

    pub(crate) fn switch_startup_variant(&mut self, variant_id: u32) -> Vec<MediaType> {
        let prev_audio_id = self.curr_audio_id;
        let prev_video_id = self.curr_video_id;
        self.set_curr_variant_and_media_id(variant_id);

        let mut changed_media_types = Vec::new();
        if self.curr_audio_id != prev_audio_id {
            changed_media_types.push(MediaType::Audio);
        }
        if self.curr_video_id != prev_video_id {
            changed_media_types.push(MediaType::Video);
        }
        changed_media_types
    }

    fn next_best_variant_id(&self) -> Option<u32> {
        if let Some(id) = best_variant_id(
            self.selectable_variants_for_curr_track().into_iter(),
            self.last_bandwidth,
        ) {
            Some(id)
        } else {
            fallback_variant_id(self.selectable_variants_for_curr_track().into_iter())
        }
    }

    fn variant_support(&self, variant_id: u32) -> Option<bool> {
        self.variant_support.get(&variant_id).copied()
    }

    fn set_variant_support(&mut self, variant_id: u32, supported: bool) {
        self.variant_support.insert(variant_id, supported);
    }

    fn curr_multivariant_media_info(&self, media_type: MediaType) -> Option<&DirectMediaInfo> {
        let playlist_id = self.curr_media_playlist_id(media_type)?;
        let info = self.multivariant_media_info.get(playlist_id)?;
        match media_type {
            MediaType::Audio => info.audio.as_ref(),
            MediaType::Video => info.video.as_ref(),
        }
    }
}

/// From a `DoubleEndedIterator` of references to `VariantStream`s ordered first by `score` then
/// `bandwidth` ascending, find the best `VariantStream` which is compatible with the given
/// bandwidth and returns its `id` property.
fn best_variant_id<'a>(
    variants: impl DoubleEndedIterator<Item = &'a VariantStream>,
    bandwidth: f64,
) -> Option<u32> {
    variants
        .rev()
        .find(|x| (x.bandwidth() as f64) <= bandwidth)
        .map(|v| v.id())
}

/// From an `Iterator` of references to `VariantStream`s ordered first by `score` then
/// `bandwidth` ascending, find the one we should fallback to if none is compatible with our
/// current bandwidth.
///
/// That fallback value is the one of the lowest bandwidth with the highest score.
fn fallback_variant_id<'a>(variants: impl Iterator<Item = &'a VariantStream>) -> Option<u32> {
    variants
        .fold(None, |acc, v| {
            if let Some((bandwidth, _)) = acc {
                if v.bandwidth() <= bandwidth {
                    Some((v.bandwidth(), v.id()))
                } else {
                    acc
                }
            } else {
                Some((v.bandwidth(), v.id()))
            }
        })
        .map(|r| r.1)
}

/// Response returned by `PlaylistStore` method which may update the current
/// variant and as a consequence, linked media playlists.
pub enum VariantUpdateResult {
    /// No MediaPlaylist was updated
    Unchanged,

    /// At least one MediaPlaylist was updated for a better one.
    ///
    /// The `MediaType` in argument designates the media type whose playlist
    /// was updated. There can only be one item of the same type in that
    /// vector.
    Improved(Vec<MediaType>),

    /// At least one MediaPlaylist was updated for a worse one.
    ///
    /// The `MediaType` in argument designates the media type whose playlist
    /// was updated. There can only be one item of the same type in that
    /// vector.
    Worsened(Vec<MediaType>),

    /// At least one MediaPlaylist was updated, but for either an as-good or
    /// for a quality that could not be compared.
    ///
    /// The `MediaType` in argument designates the media type whose playlist
    /// was updated. There can only be one item of the same type in that
    /// vector.
    EqualOrUnknown(Vec<MediaType>),
}

/// Result of calling the `set_audio_track` `PlaylistStore`'s method
#[allow(clippy::enum_variant_names)]
pub(crate) enum SetAudioTrackResponse {
    /// The audio track change led to a change of the Media Playlist for the audio.
    ///
    /// Because variants may be or not be linked to a given audio track it is also possible that
    /// the list of currently adaptively switchable variants has changed.
    AudioMediaUpdate,

    /// The audio track change led to a change for the currently-chosen variant due to the previous
    /// one not being compatible with the new chosen audio track.
    ///
    /// Because variants may be or not be linked to a given audio track it is also possible that the
    /// list of currently adaptively switchable variants has changed.
    ///
    /// The `updates` element of the associated struct is the result of such update, the
    /// `unlocked_variant`
    /// element is whether or not the previous variant was previously "locked" in place, in which
    /// case the lock has been completely disabled.
    VariantUpdate {
        updates: VariantUpdateResult,
        unlocked_variant: bool,
    },

    /// No Media Playlist nor the current variant were changed due to this track change.
    ///
    /// Because variants may be or not be linked to a given audio track it is however possible that
    /// the list of currently adaptively switchable variants has changed.
    NoUpdate,
}

pub(crate) enum LockVariantResponse {
    NoVariantWithId,
    VariantLocked {
        updates: VariantUpdateResult,
        audio_track_change: Option<u32>,
    },
}

use thiserror::Error;

/// Error encountered when creating/updating a PlaylistStore
#[derive(Error, Debug)]
pub(crate) enum PlaylistStoreError {
    #[error("No supported variant was found in the MultivariantPlaylist")]
    NoSupportedVariant,
    #[error("No variant was found in the MultivariantPlaylist. Are you sure that this isn't a Media Playlist?")]
    NoInitialVariant,
    #[error("No probe segment was available to determine startup metadata")]
    NoProbeSegment,
    // XXX TODO: We deleted MissingSelectedStreamMetadata. See if that broke the API contract
    #[error("No supported startup stream was found for the current content")]
    UnsupportedStartupStream,
}

#[cfg(test)]
mod tests {
    use super::{PlaylistStore, StartupStatus};
    use crate::{
        bindings::MediaType,
        parser::{DirectMediaInfo, TopLevelPlaylist},
        utils::url::Url,
    };

    fn parse_url(url: &str) -> Url {
        Url::new(url.to_string())
    }

    #[test]
    fn shared_multivariant_playlist_keeps_probe_metadata_per_media_type() {
        let multivariant = r#"#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Main",DEFAULT=YES,AUTOSELECT=YES
#EXT-X-STREAM-INF:BANDWIDTH=1000,AUDIO="aud"
https://example.com/media.m3u8
"#;
        let media = r#"#EXTM3U
#EXT-X-TARGETDURATION:4
#EXTINF:4,
seg.ts
"#;

        let playlist = TopLevelPlaylist::parse(
            multivariant.as_bytes(),
            parse_url("https://example.com/master.m3u8"),
        )
        .unwrap();
        let mut store = PlaylistStore::try_new(playlist, 10_000.).unwrap();
        let shared_id = store
            .curr_media_playlist_id(MediaType::Audio)
            .cloned()
            .unwrap();
        store
            .update_media_playlist(
                &shared_id,
                media.as_bytes(),
                parse_url("https://example.com/media.m3u8"),
            )
            .unwrap();

        store.set_multivariant_media_info(
            MediaType::Audio,
            DirectMediaInfo {
                mime_type: "audio/mp4".to_string(),
                media_type: MediaType::Audio,
                codec: "mp4a.40.2".to_string(),
            },
        );

        assert_eq!(
            store.current_codec(MediaType::Audio).as_deref(),
            Some("mp4a.40.2")
        );
        assert_eq!(store.current_codec(MediaType::Video), None);
        match store.startup_status(0.).unwrap() {
            StartupStatus::NeedsProbes(probes) => {
                assert_eq!(probes.len(), 1);
                assert_eq!(probes[0].1, Some(MediaType::Video));
            }
            _ => panic!("expected a remaining video probe"),
        }
    }
}
