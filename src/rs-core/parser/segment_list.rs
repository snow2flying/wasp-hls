use super::ByteRange;
use crate::{parser::MediaPlaylist, utils::url::Url, Logger};

/// List of all segments a `MediaPlaylist` is associated to.
#[derive(Clone, Debug)]
pub(crate) struct SegmentList {
    /// Initialization segments a `MediaPlaylist` is associated to, ordered chronologically
    /// (initialization linked to earlier media segments are set first).
    pub(super) init: Vec<InitSegmentInfo>,
    /// Media segments a `MediaPlaylist` is associated to, in chronological order.
    pub(super) media: Vec<MediaSegmentInfo>,
}

impl SegmentList {
    /// Returns a reference to the potential initialization segment linked to the given media
    /// segment information.
    ///
    /// Returns `None` if the given media segment isn't linked to an initialization segment.
    pub(crate) fn init_for(&self, seg: &MediaSegmentInfo) -> Option<&InitSegmentInfo> {
        self.init.iter().rev().find(|i| i.start <= seg.start())
    }

    /// Returns the list of media segments associated to this `SegmentList` in chronological order.
    pub(crate) fn media(&self) -> &[MediaSegmentInfo] {
        self.media.as_slice()
    }

    /// Returns information on the segment including the position given, in seconds.
    ///
    /// Returns `None` if no such media segment is found.
    pub(crate) fn segment_from_pos(&self, pos: f64) -> Option<&MediaSegmentInfo> {
        self.media
            .iter()
            .find(|s| s.end() > pos && s.start() <= pos)
    }
}

/// Object storing the time information on a single media segment.
#[derive(Clone, Debug)]
pub(crate) struct SegmentTimeInfo {
    /// First presentation time the segment contains media data for, in seconds.
    pub(super) start: f64,
    /// Difference between the last presentation time at which the segment contains data for
    /// in seconds and `start`.
    pub(super) duration: f64,
}

impl SegmentTimeInfo {
    /// Create a new `SegmentTimeInfo` with the given `start` and `duration` in seconds.
    pub(crate) fn new(start: f64, duration: f64) -> Self {
        Self { start, duration }
    }

    /// First presentation time the segment contains media data for, in seconds.
    pub(crate) fn start(&self) -> f64 {
        self.start
    }

    /// Last presentation time the segment contains media data for, in seconds.
    pub(crate) fn end(&self) -> f64 {
        self.start + self.duration
    }

    /// Difference between `self.end()` and `self.start()`
    pub(crate) fn duration(&self) -> f64 {
        self.duration
    }
}

/// Information linked to an initialization segment.
#[derive(Clone, Debug)]
pub(crate) struct InitSegmentInfo {
    /// First segment's start time in seconds to which that initialization segment applies.
    pub(super) start: f64,
    /// URL through which that initialization segment may be requested.
    pub(super) url: Url,
    /// If set, byte-range to specifically request only the initialization segment at the given
    /// `url`.
    pub(super) byte_range: Option<ByteRange>,
}

impl InitSegmentInfo {
    /// Returns an identifier allowing to compare the initialization segment behind this
    /// `InitSegmentInfo` to other `InitSegmentInfo` objects coming from the same `MediaPlaylist`.
    pub(crate) fn id(&self) -> f64 {
        self.start
    }

    /// If set, byte-range at which the initialization segment should be requested.
    pub(crate) fn byte_range(&self) -> Option<&ByteRange> {
        self.byte_range.as_ref()
    }

    /// URL at which the initialization segment should be requested.
    pub(crate) fn url(&self) -> &Url {
        &self.url
    }
}

/// Information linked to a single media segment.
#[derive(Clone, Debug)]
pub(crate) struct MediaSegmentInfo {
    /// Media sequence number identifying this segment within the current playlist lineage.
    /// TODO: Do we associate that one to **every segment** compated to a single base sequence
    /// number? Seems unnecessary...
    pub(super) sequence: u32,
    /// Discontinuity sequence number identifying the timeline continuity context of the segment.
    pub(super) discontinuity_sequence: u32,
    /// Information on the time boundaries of that segment.
    ///
    /// It should be exclusive to the time boundaries of all other segments in this Media Playlist.
    pub(super) time_info: SegmentTimeInfo,
    /// Program date time associated to the segment, in seconds since epoch, if known.
    /// TODO: Do we associate that one to **every segment** compared to e.g. a single base offset?
    /// Seems unnecessary...
    pub(super) program_date_time: Option<f64>,
    /// URL through which that media segment may be requested.
    pub(super) url: Url,
    /// If set, byte-range to specifically request only the media segment at the given `url`.
    pub(super) byte_range: Option<ByteRange>,
}

impl MediaSegmentInfo {
    /// Media sequence number identifying this segment within the current playlist lineage.
    pub(crate) fn sequence(&self) -> u32 {
        self.sequence
    }

    /// Discontinuity sequence number identifying the timeline continuity context of the segment.
    pub(crate) fn discontinuity_sequence(&self) -> u32 {
        self.discontinuity_sequence
    }

    /// First presentation time the segment contains media data for, in seconds.
    pub(crate) fn start(&self) -> f64 {
        self.time_info.start()
    }

    /// Last presentation time the segment contains media data for, in seconds.
    pub(crate) fn end(&self) -> f64 {
        self.time_info.end()
    }

    /// Difference between `self.end()` and `self.start()`
    pub(crate) fn duration(&self) -> f64 {
        self.time_info.duration()
    }

    /// Returns reference to the whole `SegmentTimeInfo` object linked to this media segment.
    pub(crate) fn time_info(&self) -> &SegmentTimeInfo {
        &self.time_info
    }

    /// Program date time associated to that segment, in seconds since epoch, if known.
    pub(crate) fn program_date_time(&self) -> Option<f64> {
        self.program_date_time
    }

    /// If set, byte-range at which this media segment should be requested.
    pub(crate) fn byte_range(&self) -> Option<&ByteRange> {
        self.byte_range.as_ref()
    }

    /// URL at which this initialization segment should be requested.
    pub(crate) fn url(&self) -> &Url {
        &self.url
    }
}
/// Context of an "EXT-X-PROGRAM-DATE-TIME" value usable for synchronization with another playlist.
#[derive(Clone, Copy, Debug)]
pub(super) struct TimelineReferencePdtAnchor {
    /// The discontinuity sequence number corresponding to the segment having this program date time
    pub(super) discontinuity_sequence: u32,
    /// The start time in seconds of the segment having this program date time
    pub(super) start: f64,
    /// The program date time of that segment.
    pub(super) program_date_time: f64,
}

/// Extracted information about an HLS media playlist "discontinuity", which may be useful for
/// synchronizing other media playlists with it.
#[derive(Clone, Debug)]
pub(super) struct TimelineReferenceDiscontinuity {
    /// The discontinuity sequence number of that discontinuity.
    pub(super) discontinuity_sequence: u32,
    /// The first post-discontinuity segment's start time in seconds.
    pub(super) start: f64,
    /// Program date time associated to that discontinuity sequence, if known.
    pub(super) program_date_time: Option<f64>,
}

/// Extracted information from a parsed Media Playlist which can be useful for
/// synchronization when parsing another media playlist.
#[derive(Clone, Debug)]
pub(super) struct TimelineReference {
    /// Whether at least one EXT-X-PROGRAM-DATE-TIME tag was found in the playlist.
    /// This greatly simplifies synchronization.
    pub(super) has_program_date_time: bool,
    /// Sequence number of the first announced segment in that playlist.
    pub(super) first_sequence: Option<u32>,
    /// `start`, in seconds, for the first announced segment in that playlist.
    pub(super) first_start: Option<f64>,
    /// Sequence number of the last announced segment in that playlist.
    pub(super) last_sequence: Option<u32>,
    /// `end`, in seconds, for the last announced segment in that playlist.
    pub(super) last_end: Option<f64>,
    /// `start` time in seconds for every segments announced in that playlist.
    pub(super) segment_starts: Vec<f64>,
    /// Context linked to every Announced "HLS discontinuity" in that playlist.
    pub(super) discontinuities: Vec<TimelineReferenceDiscontinuity>,
    /// Selected "EXT-X-PROGRAM-DATE-TIME" value at the middle of the playlist.
    /// The middle of the playlist is chosen because it is a more likely candidate to be retrieved
    /// in another playlist than the first (because since not available) or last (because too new)
    /// segments.
    pub(super) middle_pdt_anchor: Option<TimelineReferencePdtAnchor>,
}

impl TimelineReference {
    /// Construct the `TimelineReference` from a reference playlist, generally with the intent
    /// of synchronizing another playlist to it.
    pub(super) fn from_playlist(playlist: &MediaPlaylist) -> Self {
        let media = &playlist.segment_list().media;

        let middle_pdt_anchor = media
            .iter()
            .filter_map(|segment| {
                Some(TimelineReferencePdtAnchor {
                    discontinuity_sequence: segment.discontinuity_sequence,
                    start: segment.start(),
                    program_date_time: segment.program_date_time?,
                })
            })
            .nth(media.len() / 2);

        let mut discontinuities: Vec<TimelineReferenceDiscontinuity> = Vec::new();
        for segment in media {
            match discontinuities.last_mut() {
                Some(entry) if entry.discontinuity_sequence == segment.discontinuity_sequence => {
                    if entry.program_date_time.is_none() {
                        entry.program_date_time = segment.program_date_time()
                    }
                }
                _ => discontinuities.push(TimelineReferenceDiscontinuity {
                    discontinuity_sequence: segment.discontinuity_sequence,
                    start: segment.start(),
                    program_date_time: segment.program_date_time(),
                }),
            }
        }

        Self {
            has_program_date_time: playlist.has_program_date_time,
            first_sequence: media.first().map(|segment| segment.sequence),
            first_start: media.first().map(MediaSegmentInfo::start),
            last_sequence: media.last().map(|segment| segment.sequence),
            last_end: media.last().map(MediaSegmentInfo::end),
            segment_starts: media.iter().map(MediaSegmentInfo::start).collect(),
            discontinuities,
            middle_pdt_anchor,
        }
    }

    pub(super) fn infer_offset_for(&self, media_segments: &[MediaSegmentInfo]) -> Option<f64> {
        self.align_by_discontinuity_sequence(media_segments)
            .or_else(|| self.align_by_program_date_time(media_segments))
            .or_else(|| self.align_by_sequence_number(media_segments))
    }

    fn first_discontinuity_sequence(&self) -> Option<u32> {
        self.discontinuities
            .first()
            .map(|entry| entry.discontinuity_sequence)
    }

    fn last_discontinuity_sequence(&self) -> Option<u32> {
        self.discontinuities
            .last()
            .map(|entry| entry.discontinuity_sequence)
    }

    fn discontinuity_start(&self, discontinuity_sequence: u32) -> Option<f64> {
        self.discontinuities
            .iter()
            .find(|entry| entry.discontinuity_sequence == discontinuity_sequence)
            .map(|entry| entry.start)
    }

    fn discontinuity_pdt_anchor(
        &self,
        discontinuity_sequence: u32,
    ) -> Option<TimelineReferencePdtAnchor> {
        self.discontinuities
            .iter()
            .find(|entry| entry.discontinuity_sequence == discontinuity_sequence)
            .and_then(|entry| {
                Some(TimelineReferencePdtAnchor {
                    discontinuity_sequence: entry.discontinuity_sequence,
                    start: entry.start,
                    program_date_time: entry.program_date_time?,
                })
            })
    }

    fn start_for_sequence(&self, sequence: u32) -> Option<f64> {
        let first_sequence = self.first_sequence?;
        let idx = usize::try_from(sequence.checked_sub(first_sequence)?).ok()?;
        self.segment_starts.get(idx).copied()
    }

    fn align_by_discontinuity_sequence(&self, media_segments: &[MediaSegmentInfo]) -> Option<f64> {
        let reference_start_cc = self.first_discontinuity_sequence()?;
        let reference_end_cc = self.last_discontinuity_sequence()?;
        let start_cc = media_segments.first()?.discontinuity_sequence;
        let end_cc = media_segments.last()?.discontinuity_sequence;
        if !(start_cc < reference_end_cc && end_cc > reference_start_cc) {
            return None;
        }

        let target_cc = reference_end_cc.min(end_cc);
        let ref_start = self.discontinuity_start(target_cc)?;
        let seg = media_segments
            .iter()
            .find(|seg| seg.discontinuity_sequence == target_cc)?;
        let delta = ref_start - seg.start();
        Logger::debug(&format!(
            "Parser: aligning playlist using discontinuity sequence {} (diff:{})",
            target_cc, delta
        ));
        Some(delta)
    }

    fn align_by_program_date_time(&self, media_segments: &[MediaSegmentInfo]) -> Option<f64> {
        if !self.has_program_date_time
            || !media_segments
                .iter()
                .any(|seg| seg.program_date_time.is_some())
        {
            return None;
        }

        let reference_start_cc = self.first_discontinuity_sequence()?;
        let reference_end_cc = self.last_discontinuity_sequence()?;
        let start_cc = media_segments.first()?.discontinuity_sequence;
        let end_cc = media_segments.last()?.discontinuity_sequence;
        let target_cc = reference_end_cc.min(end_cc);

        let (ref_anchor, seg) = if reference_start_cc < target_cc && start_cc < target_cc {
            (
                self.discontinuity_pdt_anchor(target_cc),
                media_segments
                    .iter()
                    .find(|seg| seg.discontinuity_sequence == target_cc),
            )
        } else {
            (None, None)
        };

        let ref_anchor = ref_anchor.or(self.middle_pdt_anchor)?;
        let seg = seg.unwrap_or_else(|| {
            media_segments
                .iter()
                .find(|seg| seg.discontinuity_sequence == ref_anchor.discontinuity_sequence)
                .unwrap_or(&media_segments[media_segments.len() / 2])
        });

        let ref_pdt = ref_anchor.program_date_time;
        let pdt = seg.program_date_time()?;
        let date_difference = pdt - ref_pdt;
        let total_duration = media_segments
            .last()
            .map(|last| {
                last.end()
                    - media_segments
                        .first()
                        .map(|first| first.start())
                        .unwrap_or(0.)
            })
            .unwrap_or(0.);
        if date_difference.abs() > f64::max(60., total_duration) {
            Logger::debug(&format!(
                "Parser: refusing PDT alignment without overlap ({} > {})",
                date_difference.abs(),
                total_duration
            ));
            return None;
        }

        let delta = date_difference - (seg.start() - ref_anchor.start);
        Logger::debug(&format!(
            "Parser: aligning playlist using PDT (diff:{})",
            delta
        ));
        Some(delta)
    }

    fn align_by_sequence_number(&self, media_segments: &[MediaSegmentInfo]) -> Option<f64> {
        let new_first = media_segments.first()?;
        let ref_last_sequence = self.last_sequence?;
        let ref_last_end = self.last_end?;

        if let Some(ref_start) = self.start_for_sequence(new_first.sequence) {
            let offset = ref_start - new_first.start();
            Logger::debug(&format!(
                "Parser: aligning playlist based on media sequence {} (diff:{})",
                new_first.sequence, offset
            ));
            return Some(offset);
        }

        if ref_last_sequence.wrapping_add(1) == new_first.sequence {
            let offset = ref_last_end - new_first.start();
            Logger::debug(&format!(
                "Parser: aligning playlist based on first/last media sequence {} (diff:{})",
                new_first.sequence, offset
            ));
            return Some(offset);
        }

        None
    }
}
