function getBaseUrl() {
  return (
    "http://" + __TEST_CONTENT_SERVER__.URL + ":" + __TEST_CONTENT_SERVER__.PORT
  );
}

const SCENARIO_ENTRY_FILES = {
  "fmp4-direct-media": "playlist.m3u8",
  "mpegts-direct-media": "playlist.m3u8",
  "fmp4-multivariant-no-codecs": "master.m3u8",
  "mpegts-multivariant-no-codecs": "master.m3u8",
  "fmp4-player-api": "playlist.m3u8",
  "fmp4-direct-media-byterange": "playlist.m3u8",
  "fmp4-player-api-ext-x-start": "playlist.m3u8",
  "fmp4-player-api-ext-x-start-imprecise": "playlist.m3u8",
  "fmp4-alt-audio": "master.m3u8",
  "fmp4-shared-audio-muxed": "master.m3u8",
};

export function getVodScenarioUrl(scenarioId) {
  const entryFile = SCENARIO_ENTRY_FILES[scenarioId];
  if (entryFile === undefined) {
    throw new Error(`Unknown VoD scenario: ${scenarioId}`);
  }
  return `${getBaseUrl()}/vod/scenario/${scenarioId}/${entryFile}`;
}

export async function ensureVodScenarioReady(scenarioId) {
  const url = getVodScenarioUrl(scenarioId);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Unexpected status ${response.status} while preparing VoD scenario "${scenarioId}"`,
    );
  }
  await response.text();
  return url;
}
