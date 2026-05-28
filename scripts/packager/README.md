# scripts/packager

This is a wrapper to both `ffmpeg` and `gpac` to package a dummy yet
functional content with audio, video and optionally subtitles.

This is mainly intended for testing, it can also be used to easily obtain a live content
to manually test wasp-hls on a local content.

Its entry point is the `main.mjs` file, you can run it directly with an `--help` flag to
see options.

For local playback, `main.mjs` can also serve the generated output over HTTP
through the existing static server by passing `--serve`. The served manifest
will then be available at `http://localhost:<port>/master.m3u8`, with port
`9911` by default or a custom one through `--serve-http-port`.

When running it, `ffmpeg` and `gpac` both have to be accessible in path (for the latter,
unless the GPAC binary is explicitly provided through `--gpac-path`). On Windows, the
packager also checks common `gpac.exe` install locations if the binary is not on `PATH`.
