use super::{
    media_playlist::{MediaPlaylist, MediaPlaylistParsingError},
    multi_variant_playlist::{
        MediaPlaylistContext, MediaPlaylistPermanentId, MediaPlaylistUpdateError,
        MediaPlaylistUrlLocation, MultivariantPlaylist, MultivariantPlaylistParsingError,
    },
};
use crate::{
    bindings::MediaType,
    parser::{ByteRange, SegmentTimeInfo},
    utils::url::Url,
};
use std::{fmt, io};

pub(crate) enum TopLevelPlaylist {
    Multivariant(MultivariantPlaylist),
    DirectMedia(DirectMediaPlaylist),
}

/// Top-level Media playlist, i.e. there's no Multivariant playlist to rely on,
/// only a media playlist.
pub(crate) struct DirectMediaPlaylist {
    /// Unique identifier for this Media playlist
    id: MediaPlaylistPermanentId,
    /// Url to that media playlist
    url: Url,
    /// Inferred media type for the segments contained in that media playlist
    /// XXX TODO: Option?
    media_type: MediaType,
    /// The `MediaPlaylist` itself
    playlist: MediaPlaylist,
    /// Known codec string for the segments of that media playlist.
    ///
    /// Can rely on the loading of a "probe segment" in which case it is first set to
    /// `None` and only set to an actual value when known.
    codec: Option<String>,
}

pub(crate) struct ProbeSegment {
    pub(crate) url: Url,
    pub(crate) byte_range: Option<ByteRange>,
    pub(crate) payload: ProbeSegmentPayload,
}

pub(crate) enum ProbeSegmentPayload {
    Init,
    Media { time_info: SegmentTimeInfo },
}

impl TopLevelPlaylist {
    pub(crate) fn parse(data: &[u8], url: Url) -> Result<Self, TopLevelPlaylistParsingError> {
        if is_multivariant_playlist(data) {
            MultivariantPlaylist::parse(io::Cursor::new(data), url)
                .map(Self::Multivariant)
                .map_err(TopLevelPlaylistParsingError::Multivariant)
        } else {
            DirectMediaPlaylist::parse(data, url)
                .map(Self::DirectMedia)
                .map_err(TopLevelPlaylistParsingError::Media)
        }
    }

    pub(crate) fn url(&self) -> &Url {
        match self {
            Self::Multivariant(playlist) => playlist.url(),
            Self::DirectMedia(playlist) => playlist.url(),
        }
    }
}

impl DirectMediaPlaylist {
    pub(crate) fn parse(data: &[u8], url: Url) -> Result<Self, MediaPlaylistParsingError> {
        let playlist = MediaPlaylist::create(
            io::Cursor::new(data),
            url.clone(),
            None,
            &MediaPlaylistContext::default(),
        )?;
        let media_type = infer_direct_media_type(&playlist);
        Ok(Self {
            id: MediaPlaylistPermanentId::new(MediaPlaylistUrlLocation::Direct, 0),
            url,
            media_type,
            playlist,
            codec: None,
        })
    }

    pub(crate) fn id(&self) -> &MediaPlaylistPermanentId {
        &self.id
    }

    pub(crate) fn url(&self) -> &Url {
        &self.url
    }

    pub(crate) fn media_type(&self) -> MediaType {
        self.media_type
    }

    pub(crate) fn playlist(&self) -> &MediaPlaylist {
        &self.playlist
    }

    pub(crate) fn codec(&self) -> Option<&str> {
        self.codec.as_deref()
    }

    pub(crate) fn set_codec(&mut self, codec: String) {
        self.codec = Some(codec);
    }

    // XXX TODO: Unsure if this is the responsibility of top_level_playlist
    pub(crate) fn probe_segment_for(&self, wanted_position: f64) -> Option<ProbeSegment> {
        let media_segment = self
            .playlist
            .segment_from_pos(wanted_position)
            .or_else(|| self.playlist.segment_list().media().first())?;
        if let Some(init_segment) = self.playlist.segment_list().init_for(media_segment) {
            Some(ProbeSegment {
                url: init_segment.url().clone(),
                byte_range: init_segment.byte_range().cloned(),
                payload: ProbeSegmentPayload::Init,
            })
        } else {
            Some(ProbeSegment {
                url: media_segment.url().clone(),
                byte_range: media_segment.byte_range().cloned(),
                payload: ProbeSegmentPayload::Media {
                    time_info: media_segment.time_info().clone(),
                },
            })
        }
    }

    pub(crate) fn media_playlist_url(&self, wanted_id: &MediaPlaylistPermanentId) -> Option<&Url> {
        if wanted_id == &self.id {
            Some(&self.url)
        } else {
            None
        }
    }

    pub(crate) fn media_playlist(
        &self,
        wanted_id: &MediaPlaylistPermanentId,
    ) -> Option<&MediaPlaylist> {
        if wanted_id == &self.id {
            Some(&self.playlist)
        } else {
            None
        }
    }

    pub(crate) fn update_media_playlist(
        &mut self,
        id: &MediaPlaylistPermanentId,
        media_playlist_data: impl io::BufRead,
        url: Url,
    ) -> Result<&MediaPlaylist, MediaPlaylistUpdateError> {
        if id != &self.id {
            return Err(MediaPlaylistUpdateError::NotFound);
        }
        let updated = MediaPlaylist::create(
            media_playlist_data,
            url.clone(),
            Some(&self.playlist),
            &MediaPlaylistContext::default(),
        )?;
        self.media_type = infer_direct_media_type(&updated);
        self.url = url;
        self.playlist = updated;
        Ok(&self.playlist)
    }
}

#[derive(Debug)]
pub(crate) enum TopLevelPlaylistParsingError {
    Multivariant(MultivariantPlaylistParsingError),
    Media(MediaPlaylistParsingError),
}

impl fmt::Display for TopLevelPlaylistParsingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Multivariant(err) => err.fmt(f),
            Self::Media(err) => err.fmt(f),
        }
    }
}

fn is_multivariant_playlist(data: &[u8]) -> bool {
    for line in data.split(|b| *b == b'\n') {
        let line = std::str::from_utf8(line).unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with("#EXT-X-STREAM-INF") || line.starts_with("#EXT-X-MEDIA") {
            return true;
        }
    }
    false
}

// XXX TODO: Some checking to do here
fn infer_direct_media_type(playlist: &MediaPlaylist) -> MediaType {
    let has_audio_mime = playlist.mime_type(MediaType::Audio).is_some();
    let has_video_mime = playlist.mime_type(MediaType::Video).is_some();
    match (has_audio_mime, has_video_mime) {
        (true, false) => MediaType::Audio,
        _ => MediaType::Video,
    }
}
