use crate::{
    adaptive::AdaptiveQualitySelector,
    dispatcher::playlist_refresh_timers::PlaylistRefreshTimers,
    media_element::MediaElementReference,
    playlist_store::{PlaylistStore, ProbeSegmentMetadata},
    requester::Requester,
    segment_selector::NextSegmentSelectors,
};

mod api;
mod core;
mod event_listeners;
mod playlist_refresh_timers;
mod segment_request_contexts;
mod utils;

use segment_request_contexts::SegmentRequestContexts;

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

    /// Abstraction allowing to know which is the next segment to request.
    segment_selectors: NextSegmentSelectors,

    /// Current set-up timers to notify about a needed playlist refresh, associated to the playlist
    /// that needs to be refreshed.
    playlist_refresh_timers: PlaylistRefreshTimers,

    /// Stores data on pending requests linked to init or media segments.
    /// Allowing to retreive them once finished.
    segment_request_contexts: SegmentRequestContexts,

    /// A startup probe segment that has already been fetched and inspected and now only waits for
    /// the regular buffering pipeline to be ready before being pushed.
    ready_probe_segment: Option<ReadyProbeSegment>,
}

/// Identify the playback-related state the `Dispatcher` is in.
#[derive(Clone, Debug)]
enum PlayerReadyState {
    /// No content is currently loaded.
    Stopped,

    /// We're preparing a content's playlist base information
    /// Appears after `Stopped` and before `AwaitingMediaSource`.
    AwaitingPlaylistInfo {
        starting_position: Option<StartingPosition>,
    },

    /// We're creating a `MediaSource` and the corresponding buffers.
    /// Appears after `AwaitingPlaylistInfo` and before `AwaitingSegments`.
    AwaitingMediaSource {
        starting_position: Option<StartingPosition>,
    },

    /// The SourceBuffers are all ready but currently awaiting segments before
    /// being aple to play.
    /// Appears after `AwaitingMediaSource` and before `Playing`.
    AwaitingSegments,

    /// The content has enough segments to play.
    /// Note that this does not mean the media element is currently playing content:
    /// it can still be paused or at a `0` playback rate.
    /// Appears after `AwaitingSegments`.
    Playing,
}

#[derive(Clone, Copy, Debug)]
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

#[derive(Debug)]
struct ReadyProbeSegment {
    request: ProbeSegmentMetadata,
    data: event_listeners::JsMemoryBlob,
}
