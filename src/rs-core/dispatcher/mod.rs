use crate::{
    adaptive::AdaptiveQualitySelector,
    bindings::TimerId,
    media_element::MediaElementReference,
    playlist_store::{PlaylistStore, ProbeSegmentMetadata},
    requester::{PlaylistFileType, Requester},
    segment_selector::NextSegmentSelectors,
};

mod api;
mod core;
mod event_listeners;

pub(crate) use crate::bindings::{MediaSourceReadyState, PlaybackTickReason, StartingPositionType};
pub(crate) use event_listeners::{JsMemoryBlob, JsTimeRanges, MediaObservation};

/// The `Dispatcher` is the player Interface exported to the JavaScript-side,
/// providing an API to load contents and influence various parameters about playback.
pub struct Dispatcher {
    /// Current `PlayerReadyState` the `Dispatcher` is in.
    ready_state: PlayerReadyState,

    /// Allows to perform actions related to the HTMLMediaElement on the page, like buffering media,
    /// pausing, seeking etc.
    media_element_ref: MediaElementReference,

    /// Struct allowing to obtain estimate of the optimal variants to play,
    /// mostly based on network metrics.
    adaptive_selector: AdaptiveQualitySelector,

    /// Store the "Top level Playlist" (structure which describes the currently
    /// loaded content) alongside some state to keep track of the chosen... tracks.
    /// (More technically of variants and media streams).
    ///
    /// `None` if no "Top level Playlist" has been loaded yet.
    playlist_store: Option<PlaylistStore>,

    /// Abstraction allowing to perform playlist and segment requests, while
    /// easily monitoring requests that are pending.
    requester: Requester,

    /// Amount of buffer, ahead of the current position we want to build in seconds.
    /// Once we reached that point, we won't try to load load new segments.
    ///
    /// This can for example be used to limit memory and network bandwidth usage.
    buffer_goal: f64,

    /// The last known current position stored.
    /// Changes periodically and immediately on various time-changing events (such as seeks, stops
    /// etc.)
    last_position: f64,

    segment_selectors: NextSegmentSelectors,

    playlist_refresh_timers: Vec<(TimerId, PlaylistFileType)>,

    /// When/if loading a MediaPlaylist directly (instead of going through a multivariant
    /// playlist), we might not have enough information in the playlist itself to start
    /// setting up buffers and starting the regular playback loop.
    ///
    /// Instead, we have to first load a wanted segment, to be able to read that needed
    /// information from its container first.
    ///
    /// This property stores which state of this "probe" process we are in now.
    direct_media_probe: Option<DirectMediaProbeState>,
}

/// Identify the playback-related state the `Dispatcher` is in.
#[derive(Clone, Debug)]
enum PlayerReadyState {
    /// No content is currently loaded.
    Stopped,

    /// We're preparing a content's playlist, MediaSource and SourceBuffers
    Loading {
        starting_position: Option<StartingPosition>,
    },

    /// The SourceBuffers are all ready but currently awaiting segments before
    /// being aple to play.
    AwaitingSegments,

    /// The content has enough segments to play.
    /// Note that this does not mean the media element is currently playing content:
    /// it can still be paused or at a `0` playback rate.
    Playing,
}

impl PlayerReadyState {
    pub(crate) fn is_loading(&self) -> bool {
        matches!(self, PlayerReadyState::Loading { .. })
    }
}

#[derive(Clone, Debug)]
pub struct StartingPosition {
    start_type: StartingPositionType,
    position: f64,
}

impl StartingPosition {
    pub fn new(start_type: StartingPositionType, position: f64) -> Self {
        Self {
            start_type,
            position,
        }
    }
}

/// When/if loading a MediaPlaylist directly (instead of going through a multivariant
/// playlist), we might not have enough information in the playlist itself on a media's
/// associated codecs and other similar important properties.
///
/// In that case, we have to fetch that data from a segment instead.
///
/// `DirectMediaProbeState` stores the state of this process
#[derive(Debug)]
enum DirectMediaProbeState {
    /// We're in the process of loading that segment
    Pending(ProbeSegmentMetadata),
    /// That initial segment has been fetched
    Ready {
        request: ProbeSegmentMetadata,
        data: event_listeners::JsMemoryBlob,
    },
}
