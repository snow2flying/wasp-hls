pub(crate) type SegmentActionId = u32;

use std::collections::HashMap;

use crate::{
    bindings::MediaType, media_element::SegmentQualityContext, parser::SegmentTimeInfo,
    playlist_store::ProbeSegmentMetadata,
};

/// Simple store util which maps pending async segment operations to an u32
/// `SegmentActionId`.
///
/// Modules doing async operation often just refer back to an identifier when done. This
/// util allows to store the necessary information to take back the context once done.
///
/// This type of structure is necessary here because async operations might go through JS,
/// so we cannot just rely easily on Rust's `async` abstraction to save such state.
pub(crate) struct SegmentActionTracker {
    /// `SegmentActionId` that will be returned for the next inserted action.
    next_action_id: SegmentActionId,
    /// The stored "actions" themselves.
    actions: HashMap<SegmentActionId, PendingSegmentAction>,
}

impl SegmentActionTracker {
    /// Create a new `SegmentActionTracker`.
    pub(crate) fn new() -> Self {
        Self {
            next_action_id: 0,
            actions: HashMap::new(),
        }
    }

    /// Remove all operations currently waiting on this `SegmentActionTracker`.
    pub(crate) fn clear(&mut self) {
        self.actions.clear();
    }

    /// Add a new pending action in the tracker, returning a `SegmentActionId`.
    pub(crate) fn insert(&mut self, action: PendingSegmentAction) -> SegmentActionId {
        let action_id = self.next_action_id;

        // NOTE: We do not assume here the number of actions nor the longevity of the
        // runtime, so we use `wrapping_add` as a security against overflows.
        // The risk of conflict is so ridiculously low that it should not matter.
        self.next_action_id = self.next_action_id.wrapping_add(1);
        self.actions.insert(action_id, action);
        action_id
    }

    /// Get back the context associated to the given `SegmentActionId`.
    pub(crate) fn take(&mut self, action_id: SegmentActionId) -> Option<PendingSegmentAction> {
        self.actions.remove(&action_id)
    }

    /// Check a predicate against all stored actions, returning `true` if any of them matches.
    pub(crate) fn has<F>(&self, predicate: F) -> bool
    where
        F: Fn(&PendingSegmentAction) -> bool,
    {
        self.actions.values().any(predicate)
    }
}

/// Singular action item inserted into the `SegmentActionTracker`.
pub(crate) enum PendingSegmentAction {
    /// This action concerns an initialization segment
    Init {
        /// The `MediaType` the initialization segment is linked to.
        media_type: MediaType,
        /// Unique identifier identifying that initialization segment for the
        /// corresponding media and `MediaType`.
        init_segment_id: f64,
    },
    /// This action concerns a media segment
    Media {
        /// The `MediaType` the media segment is linked to.
        media_type: MediaType,
        /// Time-related metadata linked to that segment.
        time_info: SegmentTimeInfo,
        /// Additional context required for ABR
        quality_context: SegmentQualityContext,
    },
    /// This action concerns a "probe" request: we're loading a segment to know about a media's
    /// characteristics
    Probe { probe_segment: ProbeSegmentMetadata },
}

impl PendingSegmentAction {
    pub(crate) fn is_probe(&self) -> bool {
        matches!(self, Self::Probe { .. })
    }
    pub(crate) fn is_media(&self) -> bool {
        matches!(self, Self::Media { .. })
    }
    pub(crate) fn is_init(&self) -> bool {
        matches!(self, Self::Init { .. })
    }
}
