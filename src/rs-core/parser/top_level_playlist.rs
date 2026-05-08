use super::{
    media_playlist::{MediaPlaylist, MediaPlaylistParsingError},
    multi_variant_playlist::{
        MediaPlaylistContext, MediaPlaylistPermanentId, MediaPlaylistUpdateError,
        MediaPlaylistUrlLocation, MultivariantPlaylist, MultivariantPlaylistParsingError,
    },
};
use crate::{bindings::MediaType, utils::url::Url};
use std::{fmt, io};

pub(crate) enum TopLevelPlaylist {
    Multivariant(MultivariantPlaylist),
    DirectMedia(DirectMediaPlaylist),
}

pub(crate) struct DirectMediaPlaylist {
    id: MediaPlaylistPermanentId,
    url: Url,
    media_type: MediaType,
    playlist: MediaPlaylist,
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
