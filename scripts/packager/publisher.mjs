// @ts-check

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { createHash } from "crypto";
import { resolve } from "path";

const WORK_DIR_NAME = ".gpac-workdir";
const STATUS_FILE_NAME = ".publisher-status.json";
const MIN_PUBLISHED_FRAGMENT_BYTES = 128;

/**
 * @param {string} publicOutputDir
 * @returns {string}
 */
export function getGpacWorkDir(publicOutputDir) {
  return resolve(publicOutputDir, WORK_DIR_NAME);
}

/**
 * @param {string} publicOutputDir
 * @returns {string}
 */
export function getPublisherStatusPath(publicOutputDir) {
  return resolve(publicOutputDir, STATUS_FILE_NAME);
}

/**
 * Remove the private GPAC work directory used to build coherent snapshots.
 * @param {string} publicOutputDir
 */
export function cleanupGpacWorkDir(publicOutputDir) {
  rmSync(getGpacWorkDir(publicOutputDir), {
    recursive: true,
    force: true,
  });
}

/**
 * @param {{ sourceDir: string; targetDir: string; intervalMs?: number }} params
 * @returns {{ stop: () => void }}
 */
export function startLiveOutputPublisher({
  sourceDir,
  targetDir,
  intervalMs = 250,
}) {
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(targetDir, { recursive: true });

  /** @type {Map<string, string>} */
  const publishedSignatures = new Map();
  /** @type {Map<string, string>} */
  const observedBinarySignatures = new Map();
  /** @type {Map<string, string>} */
  const observedPublishedTextSignatures = new Map();
  /** @type {Map<string, string>} */
  const observedSourceTextSignatures = new Map();
  /** @type {null | { content: string; size: number; mtimeMs: number; fingerprint: string; parsed: { preambleLines: string[]; variantEntries: Array<{ streamInfLine: string; uri: string }>; audioEntries: Array<{ mediaLine: string; uri: string }>; invalidAudioEntries: Array<{ lineNumber: number; line: string; uri: string }>; trailingLines: string[] } }} */
  let lastStableMaster = null;
  let isStopped = false;
  let isPublishing = false;
  let cycleCount = 0;

  const writeStatus = (status) => {
    try {
      writeFileSync(
        getPublisherStatusPath(targetDir),
        JSON.stringify(
          {
            mode: "atomic",
            sourceDir,
            targetDir,
            intervalMs,
            cycleCount,
            at: new Date().toISOString(),
            ...status,
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch {
      // Ignore publisher diagnostic write failures.
    }
  };

  const publishOnce = () => {
    if (isStopped || isPublishing) {
      return;
    }
    isPublishing = true;
    cycleCount++;
    try {
      const state = collectPublishableState(
        sourceDir,
        targetDir,
        observedSourceTextSignatures,
        lastStableMaster,
      );
      if (
        state.status === "ready" &&
        state.masterSource.contentSource === "source"
      ) {
        lastStableMaster = {
          content: state.masterSource.content,
          size: state.masterSource.size,
          mtimeMs: state.masterSource.mtimeMs,
          fingerprint: state.masterSource.fingerprint,
          parsed: state.masterSource.parsed,
        };
      }
      if (state.status !== "ready") {
        writeStatus(state);
        return;
      }

      /** @type {Set<string>} */
      const readyAssetPaths = new Set();
      let publishedAssetCount = 0;
      for (const asset of state.assets) {
        if (isAlreadyPublished(asset, targetDir, publishedSignatures)) {
          readyAssetPaths.add(asset.relativePath);
          continue;
        }
        if (
          !isBinaryAssetReadyToPublish(
            asset,
            publishedSignatures,
            observedBinarySignatures,
          )
        ) {
          continue;
        }
        publishBinaryFileIfChanged(asset, targetDir, publishedSignatures);
        readyAssetPaths.add(asset.relativePath);
        publishedAssetCount++;
      }
      /** @type {Set<string>} */
      const readyPlaylistPaths = new Set();
      let publishedPlaylistCount = 0;
      for (const playlist of state.playlists) {
        const publishablePlaylist = buildPlaylistPublicationSnapshot(
          playlist,
          targetDir,
          readyAssetPaths,
        );
        if (publishablePlaylist === null) {
          continue;
        }
        if (
          isTextAlreadyPublished(
            publishablePlaylist,
            targetDir,
            publishedSignatures,
          )
        ) {
          readyPlaylistPaths.add(playlist.relativePath);
          publishedPlaylistCount++;
          continue;
        }
        if (
          !isTextFileReadyToPublish(
            publishablePlaylist,
            publishedSignatures,
            observedPublishedTextSignatures,
          )
        ) {
          continue;
        }
        publishTextFileIfChanged(
          publishablePlaylist,
          targetDir,
          publishedSignatures,
        );
        readyPlaylistPaths.add(playlist.relativePath);
        publishedPlaylistCount++;
      }
      let masterPublished = false;
      if (
        state.master !== null &&
        state.master.requiredPlaylistPaths.every(
          (playlistPath) =>
            readyPlaylistPaths.has(playlistPath) ||
            existsSync(resolve(targetDir, playlistPath)),
        )
      ) {
        if (
          isTextAlreadyPublished(state.master, targetDir, publishedSignatures)
        ) {
          masterPublished = true;
        } else if (
          isTextFileReadyToPublish(
            state.master,
            publishedSignatures,
            observedPublishedTextSignatures,
          )
        ) {
          publishTextFileIfChanged(
            state.master,
            targetDir,
            publishedSignatures,
          );
          masterPublished = true;
        }
      }
      writeStatus({
        status: "ready",
        sourcePlaylistCount: state.sourcePlaylistCount,
        readyPlaylistCount: state.playlists.length,
        assetCount: state.assets.length,
        publishedAssetCount,
        publishedPlaylistCount,
        masterReady: state.master !== null,
        masterPublished,
        diagnostics: state.diagnostics,
      });
    } catch (_err) {
      // Ignore transient publication failures caused by in-progress GPAC writes.
      writeStatus({
        status: "publish-error",
      });
    } finally {
      isPublishing = false;
    }
  };

  publishOnce();
  const timer = setInterval(publishOnce, intervalMs);
  timer.unref?.();

  return {
    stop() {
      isStopped = true;
      clearInterval(timer);
      writeStatus({
        status: "stopped",
      });
    },
  };
}

/**
 * Require seeing the same source signature on two consecutive publication
 * cycles before exposing a binary asset to the public directory. The
 * fingerprint includes the file bytes so fixed-size in-progress fragments do
 * not look publishable on Windows.
 *
 * @param {{ relativePath: string; sourcePath: string; size: number; mtimeMs: number; content: Buffer; fingerprint: string }} asset
 * @param {Map<string, string>} publishedSignatures
 * @param {Map<string, string>} observedBinarySignatures
 * @returns {boolean}
 */
function isBinaryAssetReadyToPublish(
  asset,
  publishedSignatures,
  observedBinarySignatures,
) {
  const signature = `${asset.size}:${asset.mtimeMs}:${asset.fingerprint}`;
  if (publishedSignatures.get(asset.relativePath) === signature) {
    observedBinarySignatures.set(asset.relativePath, signature);
    return false;
  }

  const previousObservedSignature = observedBinarySignatures.get(
    asset.relativePath,
  );
  observedBinarySignatures.set(asset.relativePath, signature);
  return previousObservedSignature === signature;
}

/**
 * @param {{ relativePath: string; sourcePath: string; size: number; mtimeMs: number; content: Buffer; fingerprint: string }} asset
 * @param {string} targetDir
 * @param {Map<string, string>} publishedSignatures
 * @returns {boolean}
 */
function isAlreadyPublished(asset, targetDir, publishedSignatures) {
  const signature = `${asset.size}:${asset.mtimeMs}:${asset.fingerprint}`;
  return (
    publishedSignatures.get(asset.relativePath) === signature &&
    existsSync(resolve(targetDir, asset.relativePath))
  );
}

/**
 * @param {{ relativePath: string; size: number; fingerprint: string }} file
 * @param {string} targetDir
 * @param {Map<string, string>} publishedSignatures
 * @returns {boolean}
 */
function isTextAlreadyPublished(file, targetDir, publishedSignatures) {
  const signature = `${file.size}:${file.fingerprint}`;
  return (
    publishedSignatures.get(file.relativePath) === signature &&
    existsSync(resolve(targetDir, file.relativePath))
  );
}

/**
 * Require seeing the same text bytes on two consecutive publication cycles
 * before exposing playlists publicly. This mirrors the binary asset rule and
 * avoids treating a torn GPAC rewrite as a real invalid playlist on slow
 * Windows runners.
 *
 * @param {{ relativePath: string; size: number; mtimeMs: number; fingerprint: string }} file
 * @param {Map<string, string>} publishedSignatures
 * @param {Map<string, string>} observedTextSignatures
 * @returns {boolean}
 */
function isTextFileReadyToPublish(
  file,
  publishedSignatures,
  observedTextSignatures,
) {
  const signature = `${file.size}:${file.fingerprint}`;
  if (publishedSignatures.get(file.relativePath) === signature) {
    observedTextSignatures.set(file.relativePath, signature);
    return false;
  }

  const previousObservedSignature = observedTextSignatures.get(
    file.relativePath,
  );
  observedTextSignatures.set(file.relativePath, signature);
  return previousObservedSignature === signature;
}

/**
 * Require seeing the same source text bytes on two consecutive cycles before
 * treating a playlist as parseable. This filters torn in-place GPAC rewrites
 * that may otherwise look stable enough under a single before/after stat check.
 *
 * @param {{ relativePath: string; size: number; mtimeMs: number; fingerprint: string }} file
 * @param {Map<string, string>} observedSourceTextSignatures
 * @returns {boolean}
 */
function isSourceTextFileStable(file, observedSourceTextSignatures) {
  const signature = `${file.size}:${file.fingerprint}`;
  const previousObservedSignature = observedSourceTextSignatures.get(
    file.relativePath,
  );
  observedSourceTextSignatures.set(file.relativePath, signature);
  return previousObservedSignature === signature;
}

/**
 * @param {string} sourceDir
 * @param {string} targetDir
 * @param {Map<string, string>} observedSourceTextSignatures
 * @param {null | { content: string; size: number; mtimeMs: number; fingerprint: string; parsed: { preambleLines: string[]; variantEntries: Array<{ streamInfLine: string; uri: string }>; audioEntries: Array<{ mediaLine: string; uri: string }>; invalidAudioEntries: Array<{ lineNumber: number; line: string; uri: string }>; trailingLines: string[] } }} lastStableMaster
 * @returns {
 * | { status: "missing-master" | "unstable-master" | "invalid-master" | "empty-master"; detail?: unknown }
 * | {
 *     status: "ready";
 *     sourcePlaylistCount: number;
 *     assets: Array<{ relativePath: string; sourcePath: string; size: number; mtimeMs: number; content: Buffer; fingerprint: string }>;
 *     playlists: Array<{ relativePath: string; content: string; size: number; mtimeMs: number; fingerprint: string; requiredAssetPaths: string[]; mediaPlaylist: { headerLines: string[]; mapUris: string[]; mediaSequence: number | null; segments: Array<{ extinfLine: string; uri: string }> } }>;
 *     master: { relativePath: string; content: string; size: number; mtimeMs: number; fingerprint: string; requiredPlaylistPaths: string[] } | null;
 *     diagnostics: {
 *       masterSource: { contentSource: "source" | "cached"; fallbackReason: string | null };
 *       sourceMaster: { variantEntryCount: number; audioEntryCount: number; ignoredInvalidAudioEntryCount: number };
 *       preparedMaster: null | { variantEntryCount: number; audioEntryCount: number };
 *       playlists: Array<{ playlistName: string; status: string; detail?: string }>;
 *     };
 *     masterSource: { contentSource: "source" | "cached"; fallbackReason: string | null; content: string; size: number; mtimeMs: number; fingerprint: string; parsed: { preambleLines: string[]; variantEntries: Array<{ streamInfLine: string; uri: string }>; audioEntries: Array<{ mediaLine: string; uri: string }>; invalidAudioEntries: Array<{ lineNumber: number; line: string; uri: string }>; trailingLines: string[] } };
 *   }
 * | { status: "no-ready-playlists"; sourcePlaylistCount: number }
 * }
 */
function collectPublishableState(
  sourceDir,
  targetDir,
  observedSourceTextSignatures,
  lastStableMaster,
) {
  const masterPath = resolve(sourceDir, "master.m3u8");
  if (!existsSync(masterPath)) {
    if (lastStableMaster !== null) {
      return buildPublishableStateFromMaster({
        sourceDir,
        targetDir,
        observedSourceTextSignatures,
        masterFile: lastStableMaster,
        parsedMaster: lastStableMaster.parsed,
        contentSource: "cached",
        fallbackReason: "missing-master",
      });
    }
    return {
      status: "missing-master",
    };
  }

  const master = readStableTextFile(masterPath);
  if (master === null) {
    if (lastStableMaster !== null) {
      return buildPublishableStateFromMaster({
        sourceDir,
        targetDir,
        observedSourceTextSignatures,
        masterFile: lastStableMaster,
        parsedMaster: lastStableMaster.parsed,
        contentSource: "cached",
        fallbackReason: "unstable-master",
      });
    }
    return {
      status: "unstable-master",
    };
  }
  if (
    !isSourceTextFileStable(
      {
        relativePath: "master.m3u8",
        size: master.size,
        mtimeMs: master.mtimeMs,
        fingerprint: master.fingerprint,
      },
      observedSourceTextSignatures,
    )
  ) {
    if (lastStableMaster !== null) {
      return buildPublishableStateFromMaster({
        sourceDir,
        targetDir,
        observedSourceTextSignatures,
        masterFile: lastStableMaster,
        parsedMaster: lastStableMaster.parsed,
        contentSource: "cached",
        fallbackReason: "unstable-master",
      });
    }
    return {
      status: "unstable-master",
    };
  }

  const masterPlaylist = parseMasterPlaylist(master.content);
  if (masterPlaylist.status !== "ready") {
    if (lastStableMaster !== null) {
      return buildPublishableStateFromMaster({
        sourceDir,
        targetDir,
        observedSourceTextSignatures,
        masterFile: lastStableMaster,
        parsedMaster: lastStableMaster.parsed,
        contentSource: "cached",
        fallbackReason: "invalid-master",
      });
    }
    return {
      status: "invalid-master",
      detail: {
        reason: masterPlaylist.reason,
        lineNumber: masterPlaylist.lineNumber,
        line: masterPlaylist.line,
        uri: masterPlaylist.uri,
        preview: summarizePlaylistText(master.content),
      },
    };
  }
  return buildPublishableStateFromMaster({
    sourceDir,
    targetDir,
    observedSourceTextSignatures,
    masterFile: master,
    parsedMaster: masterPlaylist.value,
    contentSource: "source",
    fallbackReason: null,
  });
}

/**
 * @param {{
 *   sourceDir: string;
 *   targetDir: string;
 *   observedSourceTextSignatures: Map<string, string>;
 *   masterFile: { content: string; size: number; mtimeMs: number; fingerprint: string };
 *   parsedMaster: { preambleLines: string[]; variantEntries: Array<{ streamInfLine: string; uri: string }>; audioEntries: Array<{ mediaLine: string; uri: string }>; invalidAudioEntries: Array<{ lineNumber: number; line: string; uri: string }>; trailingLines: string[] };
 *   contentSource: "source" | "cached";
 *   fallbackReason: string | null;
 * }} params
 */
function buildPublishableStateFromMaster({
  sourceDir,
  targetDir,
  observedSourceTextSignatures,
  masterFile,
  parsedMaster,
  contentSource,
  fallbackReason,
}) {
  const playlistNames = [
    ...new Set([
      ...parsedMaster.variantEntries.map((entry) => entry.uri),
      ...parsedMaster.audioEntries.map((entry) => entry.uri),
    ]),
  ];
  if (playlistNames.length === 0) {
    return {
      status: "empty-master",
    };
  }

  /** @type {Map<string, { relativePath: string; sourcePath: string; size: number; mtimeMs: number; content: Buffer; fingerprint: string }>} */
  const assetsByPath = new Map();
  /** @type {Array<{ relativePath: string; content: string; size: number; mtimeMs: number; fingerprint: string; requiredAssetPaths: string[]; mediaPlaylist: { headerLines: string[]; mapUris: string[]; mediaSequence: number | null; segments: Array<{ extinfLine: string; uri: string }> } }>} */
  const playlists = [];
  /** @type {Array<{ playlistName: string; status: string; detail?: string }>} */
  const playlistDiagnostics = [];
  let readyPlaylistCount = 0;

  for (const playlistName of playlistNames) {
    const playlistPath = resolve(sourceDir, playlistName);
    if (!existsSync(playlistPath)) {
      playlistDiagnostics.push({
        playlistName,
        status: "missing-playlist-file",
      });
      continue;
    }
    const playlist = readStableTextFile(playlistPath);
    if (playlist === null) {
      playlistDiagnostics.push({
        playlistName,
        status: "unstable-playlist-file",
      });
      continue;
    }
    if (
      !isSourceTextFileStable(
        {
          relativePath: playlistName,
          size: playlist.size,
          mtimeMs: playlist.mtimeMs,
          fingerprint: playlist.fingerprint,
        },
        observedSourceTextSignatures,
      )
    ) {
      playlistDiagnostics.push({
        playlistName,
        status: "unstable-playlist-file",
      });
      continue;
    }

    const preparedPlaylist = prepareMediaPlaylistForPublication({
      playlistName,
      playlist,
      sourceDir,
      targetDir,
    });
    if (preparedPlaylist.status !== "ready") {
      playlistDiagnostics.push({
        playlistName,
        status: preparedPlaylist.status,
        ...(preparedPlaylist.detail === undefined
          ? {}
          : { detail: preparedPlaylist.detail }),
      });
      continue;
    }

    readyPlaylistCount++;
    playlistDiagnostics.push({
      playlistName,
      status: "ready",
    });
    for (const asset of preparedPlaylist.assets) {
      assetsByPath.set(asset.relativePath, asset);
    }
    playlists.push({
      relativePath: playlistName,
      content: preparedPlaylist.content,
      size: preparedPlaylist.content.length,
      mtimeMs: playlist.mtimeMs,
      fingerprint: playlist.fingerprint,
      requiredAssetPaths: preparedPlaylist.requiredAssetPaths,
      mediaPlaylist: preparedPlaylist.mediaPlaylist,
    });
  }

  if (readyPlaylistCount === 0) {
    return {
      status: "no-ready-playlists",
      sourcePlaylistCount: playlistNames.length,
    };
  }

  const publishedPlaylistPaths = new Set(
    playlistNames.filter(
      (playlistName) =>
        playlists.some((playlist) => playlist.relativePath === playlistName) ||
        existsSync(resolve(targetDir, playlistName)),
    ),
  );
  const preparedMaster = prepareMasterPlaylistForPublication(
    parsedMaster,
    publishedPlaylistPaths,
  );

  const diagnostics = {
    masterSource: {
      contentSource,
      fallbackReason,
    },
    sourceMaster: {
      variantEntryCount: parsedMaster.variantEntries.length,
      audioEntryCount: parsedMaster.audioEntries.length,
      ignoredInvalidAudioEntryCount: parsedMaster.invalidAudioEntries.length,
    },
    preparedMaster:
      preparedMaster === null
        ? null
        : {
            variantEntryCount: preparedMaster.variantEntryCount,
            audioEntryCount: preparedMaster.audioEntryCount,
          },
    playlists: playlistDiagnostics,
  };

  return {
    status: "ready",
    sourcePlaylistCount: playlistNames.length,
    assets: [...assetsByPath.values()],
    playlists,
    masterSource: {
      contentSource,
      fallbackReason,
      content: masterFile.content,
      size: masterFile.size,
      mtimeMs: masterFile.mtimeMs,
      fingerprint: masterFile.fingerprint,
      parsed: parsedMaster,
    },
    master:
      preparedMaster === null
        ? null
        : {
            relativePath: "master.m3u8",
            content: preparedMaster.content,
            size: preparedMaster.content.length,
            mtimeMs: masterFile.mtimeMs,
            fingerprint: masterFile.fingerprint,
            requiredPlaylistPaths: preparedMaster.requiredPlaylistPaths,
          },
    diagnostics,
  };
}

/**
 * @param {{ playlistName: string; playlist: { content: string; size: number; mtimeMs: number }; sourceDir: string; targetDir: string }} params
 * @returns {
 * | { status: "ready"; content: string; assets: Array<{ relativePath: string; sourcePath: string; size: number; mtimeMs: number; content: Buffer; fingerprint: string }>; requiredAssetPaths: string[]; mediaPlaylist: { headerLines: string[]; mapUris: string[]; mediaSequence: number | null; segments: Array<{ extinfLine: string; uri: string }> } }
 * | { status: string; detail?: string }
 * }
 */
function prepareMediaPlaylistForPublication({
  playlistName,
  playlist,
  sourceDir,
  targetDir,
}) {
  const mediaPlaylist = parseMediaPlaylist(playlist.content);
  if (mediaPlaylist === null) {
    return { status: "invalid-playlist" };
  }

  /** @type {Map<string, { relativePath: string; sourcePath: string; size: number; mtimeMs: number; content: Buffer; fingerprint: string }>} */
  const assetsByPath = new Map();

  for (const mapUri of mediaPlaylist.mapUris) {
    const asset = getPublishableAsset(mapUri, sourceDir, targetDir);
    if (asset === null) {
      return {
        status: "missing-map-asset",
        detail: mapUri,
      };
    }
    if (asset !== "already-published") {
      assetsByPath.set(asset.relativePath, asset);
    }
  }

  const segmentAvailability = mediaPlaylist.segments.map((segment) => ({
    ...segment,
    asset: getPublishableAsset(segment.uri, sourceDir, targetDir),
  }));

  const firstAvailableIndex = segmentAvailability.findIndex(
    (segment) => segment.asset !== null,
  );
  if (firstAvailableIndex < 0) {
    const missingSegment = segmentAvailability.find(
      (segment) => segment.asset === null,
    );
    return {
      status: "no-segment-assets-ready",
      detail: missingSegment?.uri,
    };
  }

  let lastAvailableIndex = -1;
  for (let i = segmentAvailability.length - 1; i >= firstAvailableIndex; i--) {
    if (segmentAvailability[i].asset !== null) {
      lastAvailableIndex = i;
      break;
    }
  }
  if (lastAvailableIndex < firstAvailableIndex) {
    return { status: "no-contiguous-segment-window" };
  }

  for (let i = firstAvailableIndex; i <= lastAvailableIndex; i++) {
    if (segmentAvailability[i].asset === null) {
      return {
        status: "segment-gap-within-window",
        detail: segmentAvailability[i].uri,
      };
    }
  }

  const retainedSegments = segmentAvailability.slice(
    firstAvailableIndex,
    lastAvailableIndex + 1,
  );
  for (const segment of retainedSegments) {
    if (segment.asset !== "already-published") {
      assetsByPath.set(segment.asset.relativePath, segment.asset);
    }
  }

  return {
    status: "ready",
    content: stringifyMediaPlaylist(
      mediaPlaylist,
      retainedSegments.map(({ extinfLine, uri }) => ({ extinfLine, uri })),
      firstAvailableIndex,
      playlistName,
    ),
    assets: [...assetsByPath.values()],
    requiredAssetPaths: [
      ...mediaPlaylist.mapUris,
      ...retainedSegments.map((segment) => segment.uri),
    ],
    mediaPlaylist,
  };
}

/**
 * Build the media-playlist snapshot that can be exposed publicly in the
 * current cycle, based only on assets that are already public or are becoming
 * public in the same publication pass.
 *
 * @param {{ relativePath: string; mtimeMs: number; mediaPlaylist: { headerLines: string[]; mapUris: string[]; mediaSequence: number | null; segments: Array<{ extinfLine: string; uri: string }> } }} playlist
 * @param {string} targetDir
 * @param {Set<string>} readyAssetPaths
 * @returns {{ relativePath: string; content: string; size: number; mtimeMs: number; fingerprint: string } | null}
 */
export function buildPlaylistPublicationSnapshot(
  playlist,
  targetDir,
  readyAssetPaths,
) {
  const isAssetAvailable = (assetPath) =>
    readyAssetPaths.has(assetPath) || existsSync(resolve(targetDir, assetPath));

  if (!playlist.mediaPlaylist.mapUris.every(isAssetAvailable)) {
    return null;
  }

  const firstAvailableIndex = playlist.mediaPlaylist.segments.findIndex(
    (segment) => isAssetAvailable(segment.uri),
  );
  if (firstAvailableIndex < 0) {
    return null;
  }

  let lastAvailableIndex = firstAvailableIndex - 1;
  for (
    let i = firstAvailableIndex;
    i < playlist.mediaPlaylist.segments.length;
    i++
  ) {
    if (!isAssetAvailable(playlist.mediaPlaylist.segments[i].uri)) {
      break;
    }
    lastAvailableIndex = i;
  }

  if (lastAvailableIndex < firstAvailableIndex) {
    return null;
  }

  const retainedSegments = playlist.mediaPlaylist.segments.slice(
    firstAvailableIndex,
    lastAvailableIndex + 1,
  );
  const content = stringifyMediaPlaylist(
    playlist.mediaPlaylist,
    retainedSegments,
    firstAvailableIndex,
    playlist.relativePath,
  );
  return {
    relativePath: playlist.relativePath,
    content,
    size: content.length,
    mtimeMs: playlist.mtimeMs,
    fingerprint: createHash("sha1").update(content, "utf8").digest("hex"),
  };
}

/**
 * @param {string} relativePath
 * @param {string} sourceDir
 * @param {string} targetDir
 * @returns {{ relativePath: string; sourcePath: string; size: number; mtimeMs: number; content: Buffer; fingerprint: string } | "already-published" | null}
 */
function getPublishableAsset(relativePath, sourceDir, targetDir) {
  if (existsSync(resolve(targetDir, relativePath))) {
    return "already-published";
  }

  const sourcePath = resolve(sourceDir, relativePath);
  if (!existsSync(sourcePath)) {
    return null;
  }

  return readStableBinaryFile(sourcePath, relativePath);
}

/**
 * @param {{ relativePath: string; sourcePath: string; size: number; mtimeMs: number; content: Buffer; fingerprint: string }} file
 * @param {string} targetDir
 * @param {Map<string, string>} publishedSignatures
 */
function publishBinaryFileIfChanged(file, targetDir, publishedSignatures) {
  const signature = `${file.size}:${file.mtimeMs}:${file.fingerprint}`;
  if (publishedSignatures.get(file.relativePath) === signature) {
    return;
  }

  const targetPath = resolve(targetDir, file.relativePath);
  const tempPath = `${targetPath}.tmp-publish`;
  try {
    writeFileSync(tempPath, file.content);
    replacePublishedFile(tempPath, targetPath);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Ignore cleanup failures for transient files.
    }
    throw error;
  }
  publishedSignatures.set(file.relativePath, signature);
}

/**
 * @param {{ relativePath: string; content: string; size: number; mtimeMs: number; fingerprint: string }} file
 * @param {string} targetDir
 * @param {Map<string, string>} publishedSignatures
 */
function publishTextFileIfChanged(file, targetDir, publishedSignatures) {
  const signature = `${file.size}:${file.fingerprint}`;
  if (publishedSignatures.get(file.relativePath) === signature) {
    return;
  }

  const targetPath = resolve(targetDir, file.relativePath);
  const tempPath = `${targetPath}.tmp-publish`;
  writeFileSync(tempPath, file.content, "utf8");
  replacePublishedFile(tempPath, targetPath);
  publishedSignatures.set(file.relativePath, signature);
}

/**
 * Windows does not replace an existing destination with renameSync, so move the
 * previous public file out of the way first and restore it if the swap fails.
 *
 * @param {string} tempPath
 * @param {string} targetPath
 */
function replacePublishedFile(tempPath, targetPath) {
  const backupPath = `${targetPath}.bak-publish`;
  const hadExistingTarget = existsSync(targetPath);

  if (!hadExistingTarget) {
    renameSync(tempPath, targetPath);
    return;
  }

  try {
    try {
      unlinkSync(backupPath);
    } catch {
      // Ignore missing stale backup files from prior interrupted runs.
    }
    renameSync(targetPath, backupPath);
    renameSync(tempPath, targetPath);
    unlinkSync(backupPath);
  } catch (error) {
    try {
      if (!existsSync(targetPath) && existsSync(backupPath)) {
        renameSync(backupPath, targetPath);
      }
    } catch {
      // Ignore restore failures and rethrow the original error.
    }
    throw error;
  }
}

/**
 * @param {string} filePath
 * @returns {{ content: string; size: number; mtimeMs: number; fingerprint: string } | null}
 */
function readStableTextFile(filePath) {
  const initialStats = statSync(filePath);
  const contentBytes = readFileSync(filePath);
  const finalStats = statSync(filePath);
  if (
    initialStats.size !== finalStats.size ||
    initialStats.mtimeMs !== finalStats.mtimeMs
  ) {
    return null;
  }
  const content = contentBytes.toString("utf8");
  return {
    content,
    size: finalStats.size,
    mtimeMs: finalStats.mtimeMs,
    fingerprint: createHash("sha1").update(contentBytes).digest("hex"),
  };
}

/**
 * @param {string} filePath
 * @param {string} relativePath
 * @returns {{ relativePath: string; sourcePath: string; size: number; mtimeMs: number; content: Buffer; fingerprint: string } | null}
 */
function readStableBinaryFile(filePath, relativePath) {
  const initialStats = statSync(filePath);
  const content = readFileSync(filePath);
  const finalStats = statSync(filePath);
  if (
    initialStats.size !== finalStats.size ||
    initialStats.mtimeMs !== finalStats.mtimeMs
  ) {
    return null;
  }
  if (
    relativePath.endsWith(".m4s") &&
    !isStructurallyValidMp4Fragment(content)
  ) {
    return null;
  }
  return {
    relativePath,
    sourcePath: filePath,
    size: finalStats.size,
    mtimeMs: finalStats.mtimeMs,
    content,
    fingerprint: createHash("sha1").update(content).digest("hex"),
  };
}

/**
 * Reject obviously truncated fMP4 fragments before publishing them.
 *
 * @param {Buffer} content
 * @returns {boolean}
 */
function isStructurallyValidMp4Fragment(content) {
  if (content.length < MIN_PUBLISHED_FRAGMENT_BYTES) {
    return false;
  }

  const boxes = parseTopLevelBoxes(content);
  if (boxes === null) {
    return false;
  }

  let moofIndex = -1;
  let mdatIndex = -1;
  for (let i = 0; i < boxes.length; i++) {
    if (boxes[i].type === "moof" && moofIndex === -1) {
      moofIndex = i;
    }
    if (boxes[i].type === "mdat" && mdatIndex === -1) {
      mdatIndex = i;
    }
  }
  if (moofIndex === -1 || mdatIndex === -1 || moofIndex >= mdatIndex) {
    return false;
  }

  const mdat = boxes[mdatIndex];
  return mdat.size > 8;
}

/**
 * @param {Buffer} content
 * @returns {Array<{ type: string; size: number; start: number; end: number }> | null}
 */
function parseTopLevelBoxes(content) {
  return parseChildBoxes(content, 0);
}

/**
 * @param {Buffer} content
 * @param {number} [baseOffset]
 * @returns {Array<{ type: string; size: number; start: number; end: number }> | null}
 */
function parseChildBoxes(content, baseOffset = 0) {
  /** @type {Array<{ type: string; size: number; start: number; end: number }>} */
  const boxes = [];
  let offset = 0;

  while (offset < content.length) {
    if (content.length - offset < 8) {
      return null;
    }

    const size = content.readUInt32BE(offset);
    const type = content.toString("ascii", offset + 4, offset + 8);
    if (size === 0 || size === 1) {
      return null;
    }

    const end = offset + size;
    if (size < 8 || end > content.length) {
      return null;
    }

    boxes.push({
      type,
      size,
      start: baseOffset + offset,
      end: baseOffset + end,
    });
    offset = end;
  }

  return offset === content.length ? boxes : null;
}

/**
 * @param {string} playlistText
 * @returns {string[]}
 */
function extractPlaylistReferences(playlistText) {
  return playlistText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * @param {string} playlistText
 * @returns {string[]}
 */
function extractMediaTagUris(playlistText) {
  return playlistText
    .split("\n")
    .map((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith("#EXT-X-MEDIA:")) {
        return null;
      }
      const match = /URI="([^"]+)"/.exec(trimmedLine);
      return match === null ? null : match[1];
    })
    .filter((uri) => uri !== null);
}

/**
 * Keep master/media playlist URIs on a narrow path-based subset so corrupted
 * text or binary garbage is rejected instead of being treated as a filename.
 *
 * @param {string} uri
 * @returns {boolean}
 */
function isValidRelativePlaylistUri(uri) {
  if (uri.length === 0 || uri.includes("\0")) {
    return false;
  }
  if (uri.includes("\uFFFD") || /[\x00-\x1f\x7f]/.test(uri)) {
    return false;
  }
  if (/^[a-z]+:/i.test(uri) || uri.startsWith("/") || uri.startsWith("\\")) {
    return false;
  }
  return /^[A-Za-z0-9._/-]+\.m3u8$/u.test(uri);
}

/**
 * @param {string} playlistText
 * @returns {{ headerLines: string[]; mapUris: string[]; mediaSequence: number | null; segments: Array<{ extinfLine: string; uri: string }> } | null}
 */
function parseMediaPlaylist(playlistText) {
  /** @type {string[]} */
  const headerLines = [];
  const mapUris = [];
  /** @type {Array<{ extinfLine: string; uri: string }>} */
  const segments = [];
  /** @type {string | null} */
  let pendingExtinf = null;
  /** @type {number | null} */
  let mediaSequence = null;

  const lines = playlistText.split("\n");
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0 && pendingExtinf !== null) {
      return null;
    }
    if (trimmedLine.length === 0 && pendingExtinf === null) {
      headerLines.push(trimmedLine);
      continue;
    }
    if (trimmedLine.startsWith("#EXTINF:")) {
      if (pendingExtinf !== null) {
        return null;
      }
      pendingExtinf = trimmedLine;
      continue;
    }
    if (trimmedLine.startsWith("#EXT-X-MAP:")) {
      const match = /^#EXT-X-MAP:URI="([^"]+)"/.exec(trimmedLine);
      if (match === null) {
        return null;
      }
      headerLines.push(trimmedLine);
      mapUris.push(match[1]);
      continue;
    }
    if (trimmedLine.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      const value = Number(trimmedLine.slice("#EXT-X-MEDIA-SEQUENCE:".length));
      if (!Number.isInteger(value) || value < 0) {
        return null;
      }
      mediaSequence = value;
      headerLines.push(trimmedLine);
      continue;
    }
    if (trimmedLine.startsWith("#")) {
      if (pendingExtinf !== null) {
        return null;
      }
      headerLines.push(trimmedLine);
      continue;
    }
    if (pendingExtinf === null) {
      return null;
    }
    segments.push({
      extinfLine: pendingExtinf,
      uri: trimmedLine,
    });
    pendingExtinf = null;
  }

  if (pendingExtinf !== null) {
    return null;
  }
  if (segments.length === 0) {
    return null;
  }

  return { headerLines, mapUris, mediaSequence, segments };
}

/**
 * @param {{ headerLines: string[]; mapUris: string[]; mediaSequence: number | null; segments: Array<{ extinfLine: string; uri: string }> }} mediaPlaylist
 * @param {Array<{ extinfLine: string; uri: string }>} segments
 * @param {number} droppedSegmentCount
 * @param {string} playlistName
 * @returns {string}
 */
function stringifyMediaPlaylist(
  mediaPlaylist,
  segments,
  droppedSegmentCount,
  playlistName,
) {
  const nextMediaSequence =
    mediaPlaylist.mediaSequence === null
      ? null
      : mediaPlaylist.mediaSequence + droppedSegmentCount;
  const hasMediaSequence = mediaPlaylist.headerLines.some((line) =>
    line.startsWith("#EXT-X-MEDIA-SEQUENCE:"),
  );

  const headerLines = mediaPlaylist.headerLines.map((line) =>
    line.startsWith("#EXT-X-MEDIA-SEQUENCE:")
      ? `#EXT-X-MEDIA-SEQUENCE:${nextMediaSequence ?? 0}`
      : line,
  );

  if (!hasMediaSequence && droppedSegmentCount > 0) {
    const insertIndex = Math.min(1, headerLines.length);
    headerLines.splice(
      insertIndex,
      0,
      `#EXT-X-MEDIA-SEQUENCE:${droppedSegmentCount}`,
    );
  }

  const lines = [
    ...headerLines.filter(
      (line, index, array) => !(line === "" && index === array.length - 1),
    ),
    ...segments.flatMap((segment) => [segment.extinfLine, segment.uri]),
  ];
  if (lines.length === 0) {
    throw new Error(`Cannot publish empty media playlist: ${playlistName}`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * @param {string} playlistText
 * @returns {
 * | { status: "invalid"; reason: string; lineNumber: number | null; line: string | null; uri?: string }
 * | {
 *     status: "ready";
 *     value: {
 *       preambleLines: string[];
 *       variantEntries: Array<{ streamInfLine: string; uri: string }>;
 *       audioEntries: Array<{ mediaLine: string; uri: string }>;
 *       invalidAudioEntries: Array<{ lineNumber: number; line: string; uri: string }>;
 *       trailingLines: string[];
 *     };
 *   }
 * }
 */
function parseMasterPlaylist(playlistText) {
  const preambleLines = [];
  const variantEntries = [];
  const audioEntries = [];
  const invalidAudioEntries = [];
  const trailingLines = [];
  let pendingStreamInfLine = null;
  let seenEntry = false;

  const lines = playlistText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0 && pendingStreamInfLine !== null) {
      return {
        status: "invalid",
        reason: "blank-after-stream-inf",
        lineNumber,
        line,
      };
    }
    if (trimmedLine.length === 0) {
      if (!seenEntry) {
        preambleLines.push(line);
      } else {
        trailingLines.push(line);
      }
      continue;
    }

    if (trimmedLine.startsWith("#EXT-X-STREAM-INF:")) {
      if (pendingStreamInfLine !== null) {
        return {
          status: "invalid",
          reason: "nested-stream-inf",
          lineNumber,
          line,
        };
      }
      pendingStreamInfLine = line;
      seenEntry = true;
      continue;
    }

    if (pendingStreamInfLine !== null) {
      if (trimmedLine.startsWith("#")) {
        return {
          status: "invalid",
          reason: "tag-where-uri-expected",
          lineNumber,
          line,
        };
      }
      if (!isValidRelativePlaylistUri(trimmedLine)) {
        return {
          status: "invalid",
          reason: "invalid-variant-uri",
          lineNumber,
          line,
          uri: trimmedLine,
        };
      }
      variantEntries.push({
        streamInfLine: pendingStreamInfLine,
        uri: trimmedLine,
      });
      pendingStreamInfLine = null;
      continue;
    }

    if (trimmedLine.startsWith("#EXT-X-MEDIA:")) {
      const match = /URI="([^"]+)"/.exec(trimmedLine);
      if (match !== null) {
        seenEntry = true;
        if (!isValidRelativePlaylistUri(match[1])) {
          invalidAudioEntries.push({
            lineNumber,
            line,
            uri: match[1],
          });
          continue;
        }
        audioEntries.push({
          mediaLine: line,
          uri: match[1],
        });
        continue;
      }
    }

    if (!seenEntry) {
      preambleLines.push(line);
    } else {
      trailingLines.push(line);
    }
  }

  if (pendingStreamInfLine !== null) {
    return {
      status: "invalid",
      reason: "dangling-stream-inf-at-eof",
      lineNumber: lines.length,
      line: lines[lines.length - 1] ?? "",
    };
  }
  if (variantEntries.length === 0) {
    return {
      status: "invalid",
      reason: "no-variant-entries",
      lineNumber: null,
      line: null,
    };
  }
  if (audioEntries.length === 0 && invalidAudioEntries.length > 0) {
    return {
      status: "invalid",
      reason: "invalid-media-uri",
      lineNumber: invalidAudioEntries[0].lineNumber,
      line: invalidAudioEntries[0].line,
      uri: invalidAudioEntries[0].uri,
    };
  }

  return {
    status: "ready",
    value: {
      preambleLines,
      variantEntries,
      audioEntries,
      invalidAudioEntries,
      trailingLines,
    },
  };
}

/**
 * @param {string} playlistText
 * @returns {{ lineCount: number; firstLines: string[] }}
 */
function summarizePlaylistText(playlistText) {
  const lines = playlistText.split(/\r?\n/).map((line) => line.trimEnd());
  return {
    lineCount: lines.length,
    firstLines: lines.filter((line) => line.length > 0).slice(0, 12),
  };
}

/**
 * @param {{ preambleLines: string[]; variantEntries: Array<{ streamInfLine: string; uri: string }>; audioEntries: Array<{ mediaLine: string; uri: string }>; trailingLines: string[] }} masterPlaylist
 * @param {Set<string>} publishedPlaylistPaths
 * @returns {{ content: string; requiredPlaylistPaths: string[]; variantEntryCount: number; audioEntryCount: number } | null}
 */
function prepareMasterPlaylistForPublication(
  masterPlaylist,
  publishedPlaylistPaths,
) {
  const variantEntries = masterPlaylist.variantEntries.filter((entry) =>
    publishedPlaylistPaths.has(entry.uri),
  );
  const audioEntries = masterPlaylist.audioEntries.filter((entry) =>
    publishedPlaylistPaths.has(entry.uri),
  );

  if (variantEntries.length === 0) {
    return null;
  }

  const lines = [
    ...masterPlaylist.preambleLines,
    ...variantEntries.flatMap((entry) => [entry.streamInfLine, entry.uri]),
    ...audioEntries.map((entry) => entry.mediaLine),
    ...masterPlaylist.trailingLines,
  ];

  return {
    content: `${lines.join("\n")}\n`,
    requiredPlaylistPaths: [
      ...variantEntries.map((entry) => entry.uri),
      ...audioEntries.map((entry) => entry.uri),
    ],
    variantEntryCount: variantEntries.length,
    audioEntryCount: audioEntries.length,
  };
}
