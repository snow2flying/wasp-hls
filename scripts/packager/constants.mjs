// @ts-check

import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

// Segment / stream defaults

export const DEFAULT_SEGMENT_DURATION = 3;
export const DEFAULT_FRAME_RATE = 30;
export const DEFAULT_TIMESHIFT_BUFFER_DEPTH = 180;
export const DEFAULT_BASE_PORT = 8881;
export const DEFAULT_MEDIA_FORMAT = "fmp4";
export const DEFAULT_SUBTITLE_FORMAT = "none";
export const DEFAULT_PUBLISH_STRATEGY = "atomic";

// Text track constants

export const TEXT_TRACK_LANGUAGE = "en";
export const TEXT_TRACK_LABEL = "generated-live-subtitles";
export const TEXT_TRACK_SEGMENT_PREFIX = "text_en";
export const TEXT_TRACK_CUE_SPACING = 4;
export const TEXT_TRACK_CUE_DURATION = 2;
export const TEXT_TRACK_INITIAL_AHEAD_DURATION = 4;

// ANSI colour codes

export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const RED = "\x1b[31m";
export const GREEN = "\x1b[32m";
export const YELLOW = "\x1b[33m";
export const BLUE = "\x1b[34m";
export const MAGENTA = "\x1b[35m";
export const CYAN = "\x1b[36m";
export const WHITE = "\x1b[37m";

// Artifact file patterns

/** Regex patterns that match every file this script can produce. */
export const ARTIFACT_PATTERNS = [
  /^master\.m3u8$/,
  /^.+\.m3u8$/,
  /^.+_init\.mp4$/,
  /^.+_\d+\.m4s$/,
  /^.+_\d+\.mp4$/,
  /^.+_\d+\.ts$/,
  /^.+_\d+\.aac$/,
  /^.+_\d+\.vtt$/,
  /^source_subtitles\.(vtt|ttml)$/,
  /^live_subtitles\.vtt$/,
];

export const SCRIPT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TMP_DIR = resolve(SCRIPT_DIR, "..", "tmp");

// Default config object

/**
 * @type import("./live_packager.mjs").PackageConfig
 */
export const DEFAULT_CONFIG = {
  segmentDuration: DEFAULT_SEGMENT_DURATION,
  fragmentDuration: DEFAULT_SEGMENT_DURATION,
  frameRate: DEFAULT_FRAME_RATE,
  timeshiftBufferDepth: DEFAULT_TIMESHIFT_BUFFER_DEPTH,
  basePort: DEFAULT_BASE_PORT,
  mediaFormat: DEFAULT_MEDIA_FORMAT,
  subtitleFormat: DEFAULT_SUBTITLE_FORMAT,
  publishStrategy: DEFAULT_PUBLISH_STRATEGY,
  lowLatency: false,
  noConfirm: false,
  gpacPath: "",
  tmpDir: TMP_DIR,
  outputDir: resolve(TMP_DIR, "testcontents", "live"),
};
