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
}

#[derive(Clone, Debug)]
pub(crate) struct DirectMediaInfo {
    pub(crate) mime_type: String,
    pub(crate) media_type: crate::bindings::MediaType,
    pub(crate) codec: String,
}

impl TopLevelPlaylist {
    pub(crate) fn parse(data: &[u8], url: Url) -> Result<Self, TopLevelPlaylistParsingError> {
        match classify_playlist(data) {
            PlaylistKind::Multivariant => {
                Logger::info("Parser: this is a multivariant playlist, parsing...");
                MultivariantPlaylist::parse(io::Cursor::new(data), url)
                    .map(Self::Multivariant)
                    .map_err(TopLevelPlaylistParsingError::Multivariant)
            }
            PlaylistKind::Media => {
                Logger::info("Parser: this is a top-level media playlist, parsing...");
                DirectMediaPlaylist::parse(data, url)
                    .map(Self::DirectMedia)
                    .map_err(TopLevelPlaylistParsingError::Media)
            }
            PlaylistKind::NotAPlaylist => Err(TopLevelPlaylistParsingError::NotAPlaylist),
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

    pub(crate) fn playlist_mut(&mut self) -> &mut MediaPlaylist {
        &mut self.playlist
    }

    pub(crate) fn external_media_info(&self) -> Option<&DirectMediaInfo> {
        self.playlist.external_media_info()
    }

    pub(crate) fn set_external_media_info(&mut self, external_media_info: DirectMediaInfo) {
        self.playlist.set_external_media_info(external_media_info);
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
    NotAPlaylist,
}

impl fmt::Display for TopLevelPlaylistParsingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Multivariant(err) => err.fmt(f),
            Self::Media(err) => err.fmt(f),
            Self::NotAPlaylist => {
                write!(f, "The loaded resource does not seem to be an HLS playlist")
            }
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PlaylistKind {
    Multivariant,
    Media,
    NotAPlaylist,
}

pub fn classify_playlist(data: &[u8]) -> PlaylistKind {
    let mut first_non_empty_line = true;

    for line in data.split(|b| *b == b'\n') {
        let line = match std::str::from_utf8(line) {
            Ok(l) => l.trim(),
            Err(_) => continue,
        };

        if line.is_empty() {
            continue;
        }

        if first_non_empty_line {
            first_non_empty_line = false;
            if line != "#EXTM3U" {
                return PlaylistKind::NotAPlaylist;
            }
            continue;
        }

        if line.starts_with("#EXT-X-STREAM-INF:") || line.starts_with("#EXT-X-MEDIA:") {
            return PlaylistKind::Multivariant;
        }

        if line.starts_with("#EXT-X-TARGETDURATION")
            || line.starts_with("#EXT-X-MEDIA-SEQUENCE")
            || line.starts_with("#EXTINF:")
        {
            return PlaylistKind::Media;
        }
    }

    // Reached end of file without finding media playlist tags.
    // If #EXTM3U was present, assume Multivariant.
    if first_non_empty_line {
        PlaylistKind::NotAPlaylist
    } else {
        PlaylistKind::Multivariant
    }
}

#[cfg(test)]
mod tests {
    use super::{classify_playlist, PlaylistKind};

    #[test]
    fn classifies_non_playlist_input() {
        assert_eq!(
            classify_playlist(b"<html>not hls</html>"),
            PlaylistKind::NotAPlaylist
        );
    }

    #[test]
    fn classifies_media_playlist_input() {
        assert_eq!(
            classify_playlist(b"#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nseg.ts\n"),
            PlaylistKind::Media
        );
    }
}
