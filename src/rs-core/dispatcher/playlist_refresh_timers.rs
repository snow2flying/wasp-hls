use crate::{
    bindings::{jsClearTimer, jsTimer, TimerId, TimerReason},
    parser::MediaPlaylistPermanentId,
};

/// Live/Event Media Playlist may need to be refreshed at regular interval.
///
/// This structure simplifies the setup of a timer associated to a content's media playlist(s) by
/// ensuring:
/// - that only one timer is set at once for a particular media playlist
/// - facilitating clean-up of the media playlists that are not of interest anymore
pub(super) struct PlaylistRefreshTimers(Vec<(TimerId, MediaPlaylistPermanentId)>);

impl PlaylistRefreshTimers {
    /// Create a new empty `PlaylistRefreshTimers`
    pub(super) fn new() -> Self {
        Self(vec![])
    }

    /// Add or re-set a timer for a specific media playlist, corresponding to the given
    /// `refresh_interval`.
    pub(super) fn set_timer(
        &mut self,
        pl: MediaPlaylistPermanentId,
        refresh_interval: Option<f64>,
    ) {
        // First if a timer for that one was already set-up, clear it
        self.0.retain(|(timer_id, playlist_type)| {
            if playlist_type == &pl {
                jsClearTimer(*timer_id);
                false
            } else {
                true
            }
        });

        if let Some(refresh_interval) = refresh_interval {
            let timer_id = jsTimer(refresh_interval, TimerReason::MediaPlaylistRefresh);
            self.0.push((timer_id, pl));
        }
    }

    /// To call once a timer has resolved: remove it from stored timers and return information on
    /// the corresponding media playlist.
    pub(super) fn resolve_timer(&mut self, timer_id: TimerId) -> Option<MediaPlaylistPermanentId> {
        let found_idx = self.0.iter().position(|x| x.0 == timer_id)?;
        let (_, playlist_type) = self.0.remove(found_idx);
        Some(playlist_type)
    }

    /// Clear all pending timers triggered by this struct.
    pub(super) fn clear_all_timers(&mut self) {
        while let Some(timer_info) = self.0.pop() {
            jsClearTimer(timer_info.0);
        }
    }

    /// Retains only the timers specified by the predicate.
    pub(super) fn retain<F>(&mut self, mut f: F)
    where
        F: FnMut(&MediaPlaylistPermanentId) -> bool,
    {
        self.0.retain(|x| {
            if !f(&x.1) {
                jsClearTimer(x.0);
                false
            } else {
                true
            }
        });
    }
}
