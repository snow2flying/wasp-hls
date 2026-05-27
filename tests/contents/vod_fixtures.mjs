/* eslint-env node */

import { spawn } from "child_process";
import * as fs from "fs";
import { createHash } from "crypto";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const GENERATED_VOD_ROOT = path.join(
  __dirname,
  "..",
  "..",
  "tmp",
  "testcontents",
  "vod",
);

const RECIPE_SCHEMA_VERSION = 1;
const RECIPE_METADATA_FILE = ".recipe.json";
const generationPromises = new Map();

const CONTENT_TYPE_M3U8 = "application/vnd.apple.mpegurl";

const RECIPES = {
  "fmp4-muxed-av": {
    id: "fmp4-muxed-av",
    playlistName: "main.m3u8",
    segmentType: "fmp4",
    segmentExtension: "m4s",
    initFileName: "init.mp4",
    durationSeconds: 12,
    segmentDurationSeconds: 2,
    frameRate: 24,
    videoSize: "960x540",
    videoBitrate: "1600k",
    audioBitrate: "128k",
    audioFrequency: 880,
  },
  "mpegts-muxed-av": {
    id: "mpegts-muxed-av",
    playlistName: "main.m3u8",
    segmentType: "mpegts",
    segmentExtension: "ts",
    durationSeconds: 12,
    segmentDurationSeconds: 2,
    frameRate: 24,
    videoSize: "960x540",
    videoBitrate: "1600k",
    audioBitrate: "128k",
    audioFrequency: 660,
  },
  "fmp4-video-only": {
    id: "fmp4-video-only",
    playlistName: "main.m3u8",
    segmentType: "fmp4",
    segmentExtension: "m4s",
    initFileName: "init.mp4",
    durationSeconds: 12,
    segmentDurationSeconds: 2,
    frameRate: 24,
    videoSize: "960x540",
    videoBitrate: "1600k",
    audioBitrate: "128k",
    audioFrequency: 880,
    streams: "video",
  },
  "fmp4-audio-en": {
    id: "fmp4-audio-en",
    playlistName: "main.m3u8",
    segmentType: "fmp4",
    segmentExtension: "m4s",
    initFileName: "init.mp4",
    durationSeconds: 12,
    segmentDurationSeconds: 2,
    frameRate: 24,
    videoSize: "960x540",
    videoBitrate: "1600k",
    audioBitrate: "128k",
    audioFrequency: 440,
    streams: "audio",
  },
  "fmp4-audio-fr": {
    id: "fmp4-audio-fr",
    playlistName: "main.m3u8",
    segmentType: "fmp4",
    segmentExtension: "m4s",
    initFileName: "init.mp4",
    durationSeconds: 12,
    segmentDurationSeconds: 2,
    frameRate: 24,
    videoSize: "960x540",
    videoBitrate: "1600k",
    audioBitrate: "128k",
    audioFrequency: 554.37,
    streams: "audio",
  },
};

const SCENARIOS = {
  "fmp4-direct-media": {
    entryPath: "playlist.m3u8",
    recipeId: "fmp4-muxed-av",
    async getFile(relativePath, context) {
      if (relativePath !== "playlist.m3u8") {
        return null;
      }
      return createMediaPlaylistResponse(
        await readGeneratedMediaPlaylist("fmp4-muxed-av"),
        context,
      );
    },
  },
  "mpegts-direct-media": {
    entryPath: "playlist.m3u8",
    recipeId: "mpegts-muxed-av",
    async getFile(relativePath, context) {
      if (relativePath !== "playlist.m3u8") {
        return null;
      }
      return createMediaPlaylistResponse(
        await readGeneratedMediaPlaylist("mpegts-muxed-av"),
        context,
      );
    },
  },
  "fmp4-multivariant-no-codecs": {
    entryPath: "master.m3u8",
    recipeId: "fmp4-muxed-av",
    async getFile(relativePath, context) {
      if (relativePath === "master.m3u8") {
        return {
          body:
            "#EXTM3U\n" +
            "#EXT-X-VERSION:7\n" +
            "#EXT-X-INDEPENDENT-SEGMENTS\n" +
            "#EXT-X-STREAM-INF:BANDWIDTH=1900000,RESOLUTION=960x540\n" +
            "variant.m3u8\n",
          contentType: CONTENT_TYPE_M3U8,
        };
      }
      if (relativePath === "variant.m3u8") {
        return createMediaPlaylistResponse(
          await readGeneratedMediaPlaylist("fmp4-muxed-av"),
          context,
        );
      }
      return null;
    },
  },
  "mpegts-multivariant-no-codecs": {
    entryPath: "master.m3u8",
    recipeId: "mpegts-muxed-av",
    async getFile(relativePath, context) {
      if (relativePath === "master.m3u8") {
        return {
          body:
            "#EXTM3U\n" +
            "#EXT-X-VERSION:3\n" +
            "#EXT-X-INDEPENDENT-SEGMENTS\n" +
            "#EXT-X-STREAM-INF:BANDWIDTH=1900000,RESOLUTION=960x540\n" +
            "variant.m3u8\n",
          contentType: CONTENT_TYPE_M3U8,
        };
      }
      if (relativePath === "variant.m3u8") {
        return createMediaPlaylistResponse(
          await readGeneratedMediaPlaylist("mpegts-muxed-av"),
          context,
        );
      }
      return null;
    },
  },
  "fmp4-player-api": {
    entryPath: "playlist.m3u8",
    recipeId: "fmp4-muxed-av",
    async getFile(relativePath, context) {
      if (relativePath !== "playlist.m3u8") {
        return null;
      }
      return createMediaPlaylistResponse(
        await readGeneratedMediaPlaylist("fmp4-muxed-av"),
        context,
      );
    },
  },
  "fmp4-alt-audio": {
    entryPath: "master.m3u8",
    recipeId: "fmp4-video-only",
    async getFile(relativePath, context) {
      if (relativePath === "master.m3u8") {
        return {
          body:
            "#EXTM3U\n" +
            "#EXT-X-VERSION:7\n" +
            "#EXT-X-INDEPENDENT-SEGMENTS\n" +
            '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-main",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="audio-en.m3u8"\n' +
            '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-main",NAME="French",LANGUAGE="fr",DEFAULT=NO,AUTOSELECT=YES,URI="audio-fr.m3u8"\n' +
            '#EXT-X-STREAM-INF:BANDWIDTH=1900000,RESOLUTION=960x540,AUDIO="audio-main"\n' +
            "video.m3u8\n",
          contentType: CONTENT_TYPE_M3U8,
        };
      }
      if (relativePath === "video.m3u8") {
        return createMediaPlaylistResponse(
          await readGeneratedMediaPlaylist("fmp4-video-only"),
          context.forRecipe("fmp4-video-only"),
        );
      }
      if (relativePath === "audio-en.m3u8") {
        return createMediaPlaylistResponse(
          await readGeneratedMediaPlaylist("fmp4-audio-en"),
          context.forRecipe("fmp4-audio-en"),
        );
      }
      if (relativePath === "audio-fr.m3u8") {
        return createMediaPlaylistResponse(
          await readGeneratedMediaPlaylist("fmp4-audio-fr"),
          context.forRecipe("fmp4-audio-fr"),
        );
      }
      return null;
    },
  },
};

export async function getVodScenarioResponse(
  scenarioId,
  relativePath,
  serverBaseUrl,
) {
  const scenario = SCENARIOS[scenarioId];
  if (scenario === undefined) {
    return null;
  }
  await ensureVodRecipe(scenario.recipeId);
  const normalizedPath = normalizeScenarioRelativePath(relativePath);
  if (normalizedPath === null) {
    return null;
  }
  return await scenario.getFile(normalizedPath, {
    baseUrl: `${serverBaseUrl}/vod/generated/${scenario.recipeId}/`,
    scenarioId,
    forRecipe(recipeId) {
      return {
        baseUrl: `${serverBaseUrl}/vod/generated/${recipeId}/`,
      };
    },
  });
}

export async function ensureDefaultVodFixtures() {
  await Promise.all(
    Object.keys(RECIPES).map((recipeId) => ensureVodRecipe(recipeId)),
  );
}

export function getVodRecipeIdFromGeneratedPath(relativePath) {
  const normalizedPath = normalizeScenarioRelativePath(relativePath);
  if (normalizedPath === null) {
    return null;
  }
  const slashIndex = normalizedPath.indexOf("/");
  const recipeId =
    slashIndex === -1
      ? normalizedPath
      : normalizedPath.substring(0, slashIndex);
  if (RECIPES[recipeId] === undefined) {
    return null;
  }
  return recipeId;
}

export function getVodGeneratedRelativeFilePath(relativePath) {
  const normalizedPath = normalizeScenarioRelativePath(relativePath);
  if (normalizedPath === null) {
    return null;
  }
  const slashIndex = normalizedPath.indexOf("/");
  if (slashIndex === -1 || slashIndex === normalizedPath.length - 1) {
    return null;
  }
  return normalizedPath.substring(slashIndex + 1);
}

export function getVodRecipeOutputDir(recipeId) {
  const recipe = RECIPES[recipeId];
  return recipe === undefined ? null : path.join(GENERATED_VOD_ROOT, recipe.id);
}

export async function ensureVodRecipe(recipeId) {
  const recipe = RECIPES[recipeId];
  if (recipe === undefined) {
    throw new Error(`Unknown VoD recipe: ${recipeId}`);
  }

  const currentPromise = generationPromises.get(recipeId);
  if (currentPromise !== undefined) {
    return await currentPromise;
  }

  const generationPromise = ensureVodRecipeInner(recipe).finally(() => {
    generationPromises.delete(recipeId);
  });
  generationPromises.set(recipeId, generationPromise);
  return await generationPromise;
}

async function ensureVodRecipeInner(recipe) {
  const outputDir = path.join(GENERATED_VOD_ROOT, recipe.id);
  const expectedFingerprint = buildRecipeFingerprint(recipe);
  const metadataPath = path.join(outputDir, RECIPE_METADATA_FILE);
  const currentMetadata = await readRecipeMetadata(metadataPath);

  if (currentMetadata?.fingerprint === expectedFingerprint) {
    return {
      outputDir,
      playlistPath: path.join(outputDir, recipe.playlistName),
    };
  }

  await fs.promises.rm(outputDir, { recursive: true, force: true });
  await fs.promises.mkdir(outputDir, { recursive: true });
  await runFfmpeg(buildRecipeFfmpegArgs(recipe, outputDir), recipe.id);

  await fs.promises.writeFile(
    metadataPath,
    JSON.stringify(
      {
        schemaVersion: RECIPE_SCHEMA_VERSION,
        recipeId: recipe.id,
        fingerprint: expectedFingerprint,
      },
      null,
      2,
    ),
  );

  return {
    outputDir,
    playlistPath: path.join(outputDir, recipe.playlistName),
  };
}

function buildRecipeFingerprint(recipe) {
  return createHash("sha1")
    .update(
      JSON.stringify({
        schemaVersion: RECIPE_SCHEMA_VERSION,
        recipe,
      }),
    )
    .digest("hex");
}

async function readRecipeMetadata(metadataPath) {
  try {
    const metadata = await fs.promises.readFile(metadataPath, "utf8");
    return JSON.parse(metadata);
  } catch (_error) {
    return null;
  }
}

function buildRecipeFfmpegArgs(recipe, outputDir) {
  const gop = recipe.frameRate * recipe.segmentDurationSeconds;
  const outputPlaylistPath = path.join(outputDir, recipe.playlistName);
  const segmentFilename = path.join(
    outputDir,
    `seg-%03d.${recipe.segmentExtension}`,
  );

  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=${recipe.videoSize}:rate=${recipe.frameRate}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${recipe.audioFrequency}:sample_rate=48000`,
    "-t",
    String(recipe.durationSeconds),
    ...(recipe.streams === "audio"
      ? []
      : [
          "-map",
          "0:v:0",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-pix_fmt",
          "yuv420p",
          "-b:v",
          recipe.videoBitrate,
          "-g",
          String(gop),
          "-keyint_min",
          String(gop),
          "-sc_threshold",
          "0",
        ]),
    ...(recipe.streams === "video"
      ? []
      : [
          "-map",
          "1:a:0",
          "-c:a",
          "aac",
          "-b:a",
          recipe.audioBitrate,
          "-ac",
          "2",
          "-ar",
          "48000",
        ]),
    "-f",
    "hls",
    "-hls_time",
    String(recipe.segmentDurationSeconds),
    "-hls_list_size",
    "0",
    "-hls_playlist_type",
    "vod",
    "-hls_flags",
    "independent_segments",
    ...(recipe.segmentType === "fmp4"
      ? [
          "-hls_segment_type",
          "fmp4",
          "-hls_fmp4_init_filename",
          recipe.initFileName,
        ]
      : []),
    "-hls_segment_filename",
    segmentFilename,
    outputPlaylistPath,
  ];
}

function runFfmpeg(args, recipeId) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";

    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.once("error", (error) => {
      reject(
        new Error(
          `Failed to start ffmpeg for VoD recipe "${recipeId}": ${error.message}`,
        ),
      );
    });

    proc.once("exit", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `ffmpeg failed while generating VoD recipe "${recipeId}" with exit code ${String(exitCode)}.\n${stderr}`,
        ),
      );
    });
  });
}

async function readGeneratedMediaPlaylist(recipeId) {
  const recipe = RECIPES[recipeId];
  const outputDir = getVodRecipeOutputDir(recipeId);
  if (recipe === undefined || outputDir === null) {
    throw new Error(`Unknown VoD recipe: ${recipeId}`);
  }
  return await fs.promises.readFile(
    path.join(outputDir, recipe.playlistName),
    "utf8",
  );
}

function createMediaPlaylistResponse(playlistText, context) {
  return {
    body: rewriteMediaPlaylistUrls(playlistText, context.baseUrl),
    contentType: CONTENT_TYPE_M3U8,
  };
}

function rewriteMediaPlaylistUrls(playlistText, baseUrl) {
  return playlistText
    .split("\n")
    .map((line) => rewritePlaylistLine(line, baseUrl))
    .join("\n");
}

function rewritePlaylistLine(line, baseUrl) {
  const trimmedLine = line.trim();
  if (trimmedLine.length === 0) {
    return line;
  }
  if (!trimmedLine.startsWith("#")) {
    return toAbsoluteUrl(trimmedLine, baseUrl);
  }
  if (trimmedLine.startsWith("#EXT-X-MAP:")) {
    return trimmedLine.replace(/URI="([^"]+)"/u, (_fullMatch, uri) => {
      return `URI="${toAbsoluteUrl(uri, baseUrl)}"`;
    });
  }
  return line;
}

function toAbsoluteUrl(relativeUrl, baseUrl) {
  return new URL(relativeUrl, baseUrl).href;
}

function normalizeScenarioRelativePath(relativePath) {
  const normalizedPath = relativePath.replace(/^\/+/u, "");
  if (
    normalizedPath.length === 0 ||
    normalizedPath.includes("\0") ||
    normalizedPath.split("/").some((segment) => segment === "..")
  ) {
    return null;
  }
  return normalizedPath;
}
