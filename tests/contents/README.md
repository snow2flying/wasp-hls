# tests/contents

This directory contains the content server and static fixtures used by the test
suite.

Its `server.mjs` file creates a small HTTP server exposing the test contents and
some helper endpoints to start, stop and inspect the live packaging process used
by integration tests.

The `static` directory contains static route definitions and metadata served by
that server.

`vod_fixtures.mjs` defines VoD assets "recipes" that should be generated and
served at test time.

## Content Server API

The test content server exposes a mix of static files, generated fixtures and
helper endpoints used by integration tests:

- `GET /`: HTML index of statically registered test assets.
- `GET /live/*`: files currently produced by the live packager.
- `GET /live-alt/*`: same live output exposed through an alternate base path.
- `GET /vod/generated/<recipe-id>/*`: generated VoD assets for a given recipe.
- `GET /vod/scenario/<scenario-id>/*`: synthetic VoD playlists built on top of
  generated assets.
- `POST|GET /start_packager`: start the live packager process.
- `POST|GET /stop_packager`: stop the live packager process.
- `GET /packager_status`: inspect whether the live packager is running and which
  playlist it exposes.
- `POST|GET /live/scenario/event-endlist/reset`: reset the synthetic live/Event
  scenario used to test an `EXT-X-ENDLIST` transition.
- `GET /live/scenario/event-endlist/playlist.m3u8`: synthetic live/Event
  playlist that first serves an open `EVENT` manifest and then a finalized one
  with `#EXT-X-ENDLIST`.
