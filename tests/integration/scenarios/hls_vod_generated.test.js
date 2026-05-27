import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import WaspHlsPlayer from "../../../build/es6/ts-main/index.js";
import EmbeddedWorker from "../../../build/embedded/worker.js";
import EmbeddedWasm from "../../../build/embedded/wasm.js";
import {
  waitForLoadedState,
  waitForPlayerEvent,
} from "../utils/player_test_tools.js";
import { assertStartupBehavior } from "../utils/startup_test_tools.js";
import { getVodScenarioUrl } from "../utils/vod_scenarios.js";
import sleep from "../../utils/sleep.js";

const VOD_TEST_TIMEOUT_MS = 60_000;
const PLAYBACK_SETTLE_MS = 2_000;
const VOD_START_POSITION_TOLERANCE_S = 0.35;
const VOD_MAX_INITIAL_SEEK_DELAY_MS = 4_000;
const VOD_MAX_LOADED_DELAY_MS = 8_000;

const VOD_STARTING_POSITION_CASES = [
  {
    name: "defaults to the beginning without `startingPosition`",
    options: undefined,
    expectedPosition: 0,
    expectInitialSeek: false,
  },
  {
    name: "honors numeric absolute `startingPosition`",
    options: { startingPosition: 4 },
    expectedPosition: 4,
    expectInitialSeek: true,
  },
  {
    name: "honors object absolute `startingPosition`",
    options: {
      startingPosition: {
        startType: "Absolute",
        position: 6,
      },
    },
    expectedPosition: 6,
    expectInitialSeek: true,
  },
  {
    name: "honors `FromBeginning` `startingPosition`",
    options: {
      startingPosition: {
        startType: "FromBeginning",
        position: 3,
      },
    },
    expectedPosition: 3,
    expectInitialSeek: true,
  },
  {
    name: "honors `FromEnd` `startingPosition`",
    options: {
      startingPosition: {
        startType: "FromEnd",
        position: 5,
      },
    },
    expectedPosition: 7,
    expectInitialSeek: true,
  },
];

function expectPositionToAdvance(player, startPosition) {
  const newPosition = player.getPosition();
  expect(newPosition).toBeGreaterThan(startPosition + 0.8);
}

describe("Generated VoD content", function () {
  let player;
  let lastPlayerError = null;
  const videoElement = document.createElement("video");

  beforeAll(() => {
    document.body.appendChild(videoElement);
  });

  afterAll(() => {
    document.body.removeChild(videoElement);
  });

  beforeEach(() => {
    lastPlayerError = null;
    player = new WaspHlsPlayer(videoElement);
    player.initialize({
      workerUrl: EmbeddedWorker,
      wasmUrl: EmbeddedWasm,
    });
    player.addEventListener("error", (error) => {
      lastPlayerError = error;
    });
  });

  afterEach(() => {
    player.dispose();
    videoElement.removeAttribute("src");
    videoElement.load();
  });

  it(
    "plays a direct fMP4 media playlist",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          player.resume();
        }
      });

      player.load(getVodScenarioUrl("fmp4-direct-media"));
      await waitForLoadedState(player, videoElement, () => lastPlayerError);

      expect(player.isLive()).toEqual(false);
      expect(player.isVod()).toEqual(true);
      expect(player.getMaximumPosition()).toBeGreaterThan(10);

      const startPosition = player.getPosition();
      await sleep(PLAYBACK_SETTLE_MS);
      expectPositionToAdvance(player, startPosition);
    },
  );

  it(
    "plays a direct MPEG-TS media playlist",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          player.resume();
        }
      });

      player.load(getVodScenarioUrl("mpegts-direct-media"));
      await waitForLoadedState(player, videoElement, () => lastPlayerError);

      expect(player.isLive()).toEqual(false);
      expect(player.isVod()).toEqual(true);
      expect(player.getMaximumPosition()).toBeGreaterThan(10);

      const startPosition = player.getPosition();
      await sleep(PLAYBACK_SETTLE_MS);
      expectPositionToAdvance(player, startPosition);
    },
  );

  it(
    "plays a direct fMP4 media playlist using EXT-X-BYTERANGE",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          player.resume();
        }
      });

      player.load(getVodScenarioUrl("fmp4-direct-media-byterange"));
      await waitForLoadedState(player, videoElement, () => lastPlayerError);

      expect(player.isLive()).toEqual(false);
      expect(player.isVod()).toEqual(true);
      expect(player.getMaximumPosition()).toBeGreaterThan(10);

      const startPosition = player.getPosition();
      await sleep(PLAYBACK_SETTLE_MS);
      expectPositionToAdvance(player, startPosition);
    },
  );

  it(
    "plays a multivariant fMP4 playlist without CODECS",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          player.resume();
        }
      });

      player.load(getVodScenarioUrl("fmp4-multivariant-no-codecs"));
      await waitForLoadedState(player, videoElement, () => lastPlayerError);

      expect(player.isVod()).toEqual(true);
      expect(player.getCurrentVariant()).not.toBeUndefined();

      const startPosition = player.getPosition();
      await sleep(PLAYBACK_SETTLE_MS);
      expectPositionToAdvance(player, startPosition);
    },
  );

  it(
    "plays a multivariant MPEG-TS playlist without CODECS",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          player.resume();
        }
      });

      player.load(getVodScenarioUrl("mpegts-multivariant-no-codecs"));
      await waitForLoadedState(player, videoElement, () => lastPlayerError);

      expect(player.isVod()).toEqual(true);
      expect(player.getCurrentVariant()).not.toBeUndefined();

      const startPosition = player.getPosition();
      await sleep(PLAYBACK_SETTLE_MS);
      expectPositionToAdvance(player, startPosition);
    },
  );

  it(
    "exposes coherent VoD player API values",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      let latestContentInfoUpdate;

      player.addEventListener("contentInfoUpdate", (event) => {
        latestContentInfoUpdate = event;
      });
      player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          player.resume();
        }
      });

      player.load(getVodScenarioUrl("fmp4-player-api"));
      await waitForLoadedState(player, videoElement, () => lastPlayerError);

      const minimumPosition = player.getMinimumPosition();
      const maximumPosition = player.getMaximumPosition();
      const seekableMinimumPosition = player.getSeekableMinimumPosition();
      const seekableMaximumPosition = player.getSeekableMaximumPosition();

      expect(player.isLive()).toEqual(false);
      expect(player.isVod()).toEqual(true);
      expect(player.getMediaDuration()).toBeGreaterThan(10);
      expect(minimumPosition).toBeDefined();
      expect(maximumPosition).toBeDefined();
      expect(seekableMinimumPosition).toBeDefined();
      expect(seekableMaximumPosition).toBeDefined();
      expect(minimumPosition).toBeLessThanOrEqual(0.1);
      expect(seekableMinimumPosition).toBeLessThanOrEqual(0.1);
      expect(maximumPosition).toBeGreaterThan(10);
      expect(seekableMaximumPosition).toBeGreaterThan(10);
      expect(latestContentInfoUpdate?.isLive).toEqual(false);

      player.seek(4);
      await sleep(1_500);

      const currentPosition = player.getPosition();
      expect(currentPosition).toBeGreaterThan(3);
      expect(currentPosition).toBeLessThan(7);

      const maximumAfterSeek = player.getMaximumPosition();
      const seekableMaximumAfterSeek = player.getSeekableMaximumPosition();

      expect(
        Math.abs((maximumAfterSeek ?? 0) - (maximumPosition ?? 0)),
      ).toBeLessThan(0.3);
      expect(
        Math.abs(
          (seekableMaximumAfterSeek ?? 0) - (seekableMaximumPosition ?? 0),
        ),
      ).toBeLessThan(0.3);
    },
  );

  for (const testCase of VOD_STARTING_POSITION_CASES) {
    it(testCase.name, { timeout: VOD_TEST_TIMEOUT_MS }, async () => {
      await assertStartupBehavior({
        player,
        videoElement,
        lastPlayerErrorRef: () => lastPlayerError,
        loadContent() {
          player.load(getVodScenarioUrl("fmp4-player-api"), testCase.options);
        },
        expectInitialSeek: testCase.expectInitialSeek,
        maxInitialSeekDelayMs: VOD_MAX_INITIAL_SEEK_DELAY_MS,
        maxLoadedDelayMs: VOD_MAX_LOADED_DELAY_MS,
        assertLoadedSnapshot(snapshot) {
          expect(snapshot.playerState).toEqual("Loaded");
          expect(snapshot.playerError).toBeNull();
          expect(snapshot.position).toBeGreaterThanOrEqual(
            testCase.expectedPosition - VOD_START_POSITION_TOLERANCE_S,
          );
          expect(snapshot.position).toBeLessThanOrEqual(
            testCase.expectedPosition + VOD_START_POSITION_TOLERANCE_S,
          );
        },
      });
    });
  }

  it(
    "defaults to the playlist `EXT-X-START` point when no API override is set",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      await assertStartupBehavior({
        player,
        videoElement,
        lastPlayerErrorRef: () => lastPlayerError,
        loadContent() {
          player.load(getVodScenarioUrl("fmp4-player-api-ext-x-start"));
        },
        expectInitialSeek: true,
        maxInitialSeekDelayMs: VOD_MAX_INITIAL_SEEK_DELAY_MS,
        maxLoadedDelayMs: VOD_MAX_LOADED_DELAY_MS,
        assertLoadedSnapshot(snapshot) {
          expect(snapshot.position).toBeGreaterThanOrEqual(5.7);
          expect(snapshot.position).toBeLessThanOrEqual(6.3);
        },
      });
    },
  );

  it(
    "snaps `EXT-X-START` to the containing segment start when `PRECISE=NO`",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      await assertStartupBehavior({
        player,
        videoElement,
        lastPlayerErrorRef: () => lastPlayerError,
        loadContent() {
          player.load(
            getVodScenarioUrl("fmp4-player-api-ext-x-start-imprecise"),
          );
        },
        expectInitialSeek: true,
        maxInitialSeekDelayMs: VOD_MAX_INITIAL_SEEK_DELAY_MS,
        maxLoadedDelayMs: VOD_MAX_LOADED_DELAY_MS,
        assertLoadedSnapshot(snapshot) {
          expect(snapshot.position).toBeGreaterThanOrEqual(3.7);
          expect(snapshot.position).toBeLessThanOrEqual(4.3);
        },
      });
    },
  );

  it(
    "exposes alternate audio tracks through the player API",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          player.resume();
        }
      });

      player.load(getVodScenarioUrl("fmp4-alt-audio"));
      await waitForLoadedState(player, videoElement, () => lastPlayerError);

      const audioTracks = player.getAudioTrackList();
      const currentTrack = player.getCurrentAudioTrack();

      expect(player.isVod()).toEqual(true);
      expect(audioTracks).toHaveLength(2);
      expect(audioTracks.map((track) => track.language).sort()).toEqual([
        "en",
        "fr",
      ]);
      expect(audioTracks.map((track) => track.name).sort()).toEqual([
        "English",
        "French",
      ]);
      expect(currentTrack).toBeDefined();
      expect(currentTrack?.language).toEqual("en");
    },
  );

  it(
    "switches alternate audio tracks through setAudioTrack",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          player.resume();
        }
      });

      player.load(getVodScenarioUrl("fmp4-alt-audio"));
      await waitForLoadedState(player, videoElement, () => lastPlayerError);

      const frenchTrack = player
        .getAudioTrackList()
        .find((track) => track.language === "fr");
      expect(frenchTrack).toBeDefined();

      const switchedTrackPromise = waitForPlayerEvent(
        player,
        "audioTrackUpdate",
        (track) => track?.id === frenchTrack?.id,
      );
      player.setAudioTrack(frenchTrack.id);
      const switchedTrack = await switchedTrackPromise;

      expect(switchedTrack.language).toEqual("fr");
      expect(player.getCurrentAudioTrack()?.id).toEqual(frenchTrack.id);
    },
  );
});
