use super::{
    media_playlist::{MediaPlaylist, MediaPlaylistParsingError},
    multi_variant_playlist::{
        MediaPlaylistContext, MediaPlaylistPermanentId, MediaPlaylistUpdateError,
        MediaPlaylistUrlLocation, MultivariantPlaylist, MultivariantPlaylistParsingError,
    },
};
use crate::{utils::url::Url, Logger};
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
    /// The `MediaPlaylist` itself
    playlist: MediaPlaylist,
    /// Known metadata for the segments of that media playlist.
    ///
    /// Can rely on the loading of a "probe segment" in which case it is first set to
    /// `None` and only set to an actual value when known.
    media_info: Option<DirectMediaInfo>,
}

#[derive(Clone)]
pub(crate) struct DirectMediaInfo {
    pub(crate) mime_type: String,
    pub(crate) media_type: crate::bindings::MediaType,
    pub(crate) codec: String,
}

impl TopLevelPlaylist {
    pub(crate) fn parse(data: &[u8], url: Url) -> Result<Self, TopLevelPlaylistParsingError> {
        if is_multivariant_playlist(data) {
            Logger::info("Parser: this is a multivariant playlist, parsing...");
            MultivariantPlaylist::parse(io::Cursor::new(data), url)
                .map(Self::Multivariant)
                .map_err(TopLevelPlaylistParsingError::Multivariant)
        } else {
            Logger::info("Parser: this is a top-level media playlist, parsing...");
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
        Ok(Self {
            id: MediaPlaylistPermanentId::new(MediaPlaylistUrlLocation::Direct, 0),
            url,
            playlist,
            media_info: None,
        })
    }

    pub(crate) fn id(&self) -> &MediaPlaylistPermanentId {
        &self.id
    }

    pub(crate) fn url(&self) -> &Url {
        &self.url
    }

    pub(crate) fn playlist(&self) -> &MediaPlaylist {
        &self.playlist
    }

    pub(crate) fn media_info(&self) -> Option<&DirectMediaInfo> {
        self.media_info.as_ref()
    }

    pub(crate) fn set_media_info(&mut self, media_info: DirectMediaInfo) {
        self.media_info = Some(media_info);
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
        // XXX TODO: Maybe we should assume Multivariant and do the reverse check to limit
        //           impact?
        if line.starts_with("#EXT-X-STREAM-INF:") || line.starts_with("#EXT-X-MEDIA:") {
            return true;
        }
    }
    false
}
