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
  startLivePackager,
  stopLivePackager,
  waitForPackagerReady,
} from "../utils/live_packager.js";
import sleep from "../../utils/sleep.js";
import { waitForLoadedStateAfterLoad } from "../../utils/waitForPlayerState";

const LIVE_PACKAGER_PUBLISH_STRATEGY =
  globalThis.__WASP_HLS_TEST_PUBLISH_STRATEGY__ === "direct" ||
  globalThis.__WASP_HLS_TEST_PUBLISH_STRATEGY__ === "atomic"
    ? globalThis.__WASP_HLS_TEST_PUBLISH_STRATEGY__
    : "atomic";

const PLAYER_LOAD_TIMEOUT_MS = 90_000;
const LIVE_PLAYBACK_ASSERTION_WINDOW_S = 100;
const LIVE_PLAYBACK_TEST_TIMEOUT_MS = 240_000;

function getPlayerStateSnapshot(player, videoElement, lastPlayerError) {
  return {
    playerState: player.getPlayerState(),
    playerError: player.getError() ?? lastPlayerError,
    position: player.getPosition(),
    minimumPosition: player.getMinimumPosition(),
    maximumPosition: player.getMaximumPosition(),
    currentTime: videoElement.currentTime,
    readyState: videoElement.readyState,
    networkState: videoElement.networkState,
    paused: videoElement.paused,
    ended: videoElement.ended,
  };
}

async function waitForLoadedState(player, videoElement, lastPlayerErrorRef) {
  const timeoutPromise = sleep(PLAYER_LOAD_TIMEOUT_MS).then(() => {
    throw new Error(
      "Player did not reach Loaded in time: " +
        JSON.stringify(
          getPlayerStateSnapshot(player, videoElement, lastPlayerErrorRef()),
        ),
    );
  });

  try {
    await Promise.race([waitForLoadedStateAfterLoad(player), timeoutPromise]);
  } catch (error) {
    throw new Error(
      "Player failed before reaching Loaded: " +
        JSON.stringify({
          error,
          snapshot: getPlayerStateSnapshot(
            player,
            videoElement,
            lastPlayerErrorRef(),
          ),
        }),
    );
  }

  if (player.getPlayerState() !== "Loaded") {
    throw new Error(
      "Player did not settle in Loaded state: " +
        JSON.stringify(
          getPlayerStateSnapshot(player, videoElement, lastPlayerErrorRef()),
        ),
    );
  }
}

describe("Live packaged content", function () {
  let player;
  let playlistUrl;
  let segmentDuration;
  let timeShiftBufferDepth;
  let lastPlayerError = null;
  const videoElement = document.createElement("video");

  beforeAll(
    async () => {
      document.body.appendChild(videoElement);
      await startLivePackager(LIVE_PACKAGER_PUBLISH_STRATEGY);

      const readyInfos = await waitForPackagerReady();
      playlistUrl = readyInfos.playlistUrl;
      segmentDuration = readyInfos.segmentDuration;
      timeShiftBufferDepth = readyInfos.timeShiftBufferDepth;
    },
    (3600 / 2) * 1000,
  );

  afterAll(async () => {
    document.body.removeChild(videoElement);
    await stopLivePackager();
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
  });

  it(
    "should fetch, update and play the Manifest",
    { timeout: LIVE_PLAYBACK_TEST_TIMEOUT_MS },
    async function () {
      player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          player.resume();
        }
      });

      player.load(playlistUrl);
      await waitForLoadedState(player, videoElement, () => lastPlayerError);

      expect(player.isLive()).toEqual(true);

      const basePos = player.getPosition();
      const baseMin = player.getMinimumPosition();
      const baseMax = player.getMaximumPosition();
      const baseGap = baseMax - basePos;

      expect(baseGap).toBeGreaterThan(5);
      expect(baseGap).toBeLessThan(20);

      const secondsWaiting = LIVE_PLAYBACK_ASSERTION_WINDOW_S;
      await sleep(secondsWaiting * 1000);

      const newPos = player.getPosition();
      const newMin = player.getMinimumPosition();
      const newMax = player.getMaximumPosition();

      expect(newMax - baseMax).toBeGreaterThanOrEqual(secondsWaiting * 0.8);
      expect(newMin - baseMin).toBeGreaterThanOrEqual(secondsWaiting * 0.8);
      expect(newMax - newPos).toBeGreaterThan(5);
      expect(newMax - newPos).toBeLessThan(20);
      expect(newPos - basePos).toBeGreaterThanOrEqual(secondsWaiting * 0.8);
      expect(segmentDuration).toBeGreaterThan(0);
      expect(timeShiftBufferDepth).toBeGreaterThan(0);
    },
  );
});
