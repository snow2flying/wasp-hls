import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "../testing-lib/simple-test-lib.js";
import WaspHlsPlayer from "../../build/es6/ts-main/index.js";
import EmbeddedWasm from "../../build/embedded/wasm.js";
import {
  assertMemoryApisAvailable,
  takeMemoryMeasurement,
} from "../utils/browser_memory.js";
import { createTestWorker } from "../utils/create_test_worker.js";
import {
  startLivePackager,
  stopLivePackager,
  waitForPackagerReady,
} from "../utils/live_packager.js";
import { waitForLoadedState } from "../utils/player_test_tools.js";
import sleep from "../utils/sleep.js";
import { getVodScenarioUrl } from "../utils/vod_scenarios.js";

const MEMORY_VOD_SCENARIO = "fmp4-multivariant-alt-audio";
const MEASUREMENT_SETTLE_MS = 4000;
const PLAYBACK_PROGRESS_TIMEOUT_MS = 90_000;
const LOAD_PLATEAU_CONFIG = {
  totalIterations: 120,
  batchSize: 12,
  maxCheckpointTotalMemoryUsage: 12e6,
  maxCheckpointWasmMemoryUsage: 9e6,
};
const INSTANCE_PLATEAU_CONFIG = {
  totalIterations: 75,
  batchSize: 5,
  maxCheckpointTotalMemoryUsage: 12e6,
  maxCheckpointWasmMemoryUsage: 9e6,
};
const MEMORY_TELEMETRY_OPTIONS = {
  collectTelemetry: true,
  storeTelemetryHistory: false,
};

describe("Memory tests", () => {
  let player = /** @type {WaspHlsPlayer} */ (null);
  let workerHandle = null;
  const videoElement = document.createElement("video");
  let lastPlayerError = null;

  beforeAll(() => {
    videoElement.muted = true;
    videoElement.playsInline = true;
    document.body.appendChild(videoElement);
  });

  afterAll(() => {
    document.body.removeChild(videoElement);
  });

  beforeEach(async () => {
    lastPlayerError = null;
    workerHandle = createTestWorker(MEMORY_TELEMETRY_OPTIONS);
    player = new WaspHlsPlayer(videoElement, {});
    await player.initialize({
      workerUrl: workerHandle.url,
      wasmUrl: EmbeddedWasm,
    });
    player.addEventListener("error", (error) => {
      lastPlayerError = error;
    });
  });

  afterEach(async () => {
    if (player) {
      player.dispose();
    }
    workerHandle?.dispose();
    workerHandle = null;
    videoElement.removeAttribute("src");
    window.gc?.();
    await sleep(1000);
  });

  it(
    "should not have a sensible memory leak after playing a content",
    { timeout: 22.5 * 60 * 1000, retry: 2 },
    async function () {
      await assertMemoryApisAvailable(workerHandle.telemetry);
      const initialMemory = await takeMemoryMeasurement(workerHandle.telemetry);

      await loadAndWaitUntilPlayable(
        player,
        videoElement,
        getVodScenarioUrl(MEMORY_VOD_SCENARIO),
        () => lastPlayerError,
      );
      player.setSpeed(4);
      await player.resume();
      await waitForPlaybackProgress(
        videoElement,
        8,
        PLAYBACK_PROGRESS_TIMEOUT_MS,
      );

      player.stop();
      await sleep(MEASUREMENT_SETTLE_MS);
      const newMemory = await takeMemoryMeasurement(workerHandle.telemetry);
      displayResultAndCheckLimit({
        maxTotalMemoryUsage: 4e6,
        maxWasmMemoryUsage: 3e6,
        initialMemory,
        newMemory,
      });
    },
  );

  it(
    "should not have a sensible memory leak after 1000 LOADED states and adaptive streaming",
    { timeout: 15 * 60 * 1000, retry: 2 },
    async function () {
      await assertMemoryApisAvailable(workerHandle.telemetry);
      const initialMemory = await takeMemoryMeasurement(workerHandle.telemetry);

      for (let i = 0; i < 1000; i++) {
        await loadAndWaitUntilPlayable(
          player,
          videoElement,
          getVodScenarioUrl(MEMORY_VOD_SCENARIO),
          () => lastPlayerError,
        );
        player.stop();
      }

      await sleep(MEASUREMENT_SETTLE_MS);
      const newMemory = await takeMemoryMeasurement(workerHandle.telemetry);
      displayResultAndCheckLimit({
        maxTotalMemoryUsage: 8e6,
        maxWasmMemoryUsage: 6e6,
        initialMemory,
        newMemory,
      });
    },
  );

  it(
    "should stabilize after repeated LOADED states and adaptive streaming",
    { timeout: 22.5 * 60 * 1000, retry: 2 },
    async function () {
      await assertMemoryApisAvailable(workerHandle.telemetry);
      const initialMemory = await takeMemoryMeasurement(workerHandle.telemetry);

      await runPlateauCheck({
        initialMemory,
        ...LOAD_PLATEAU_CONFIG,
        measure: () => takeMemoryMeasurement(workerHandle.telemetry),
        iterate: async () => {
          await loadAndWaitUntilPlayable(
            player,
            videoElement,
            getVodScenarioUrl(MEMORY_VOD_SCENARIO),
            () => lastPlayerError,
          );
          player.stop();
        },
      });
    },
  );

  it(
    "should not have a sensible memory leak after 500 player instances",
    { timeout: 45 * 60 * 1000, retry: 2 },
    async function () {
      await assertMemoryApisAvailable(workerHandle.telemetry);
      const initialMemory = await takeMemoryMeasurement(workerHandle.telemetry);
      player.dispose();
      workerHandle?.dispose();
      workerHandle = null;
      player = null;

      for (let i = 0; i < 500; i++) {
        const iterationWorkerHandle = createTestWorker({
          ...MEMORY_TELEMETRY_OPTIONS,
        });
        const iterationPlayer = new WaspHlsPlayer(videoElement, {});
        iterationPlayer.addEventListener("error", (error) => {
          lastPlayerError = error;
        });
        await iterationPlayer.initialize({
          workerUrl: iterationWorkerHandle.url,
          wasmUrl: EmbeddedWasm,
        });
        await loadAndWaitUntilPlayable(
          iterationPlayer,
          videoElement,
          getVodScenarioUrl(MEMORY_VOD_SCENARIO),
          () => lastPlayerError,
        );
        iterationPlayer.dispose();
        iterationWorkerHandle.dispose();
      }

      await sleep(MEASUREMENT_SETTLE_MS);
      workerHandle = createTestWorker(MEMORY_TELEMETRY_OPTIONS);
      player = new WaspHlsPlayer(videoElement, {});
      await player.initialize({
        workerUrl: workerHandle.url,
        wasmUrl: EmbeddedWasm,
      });
      const newMemory = await takeMemoryMeasurement(workerHandle.telemetry);
      displayResultAndCheckLimit({
        maxTotalMemoryUsage: 8e6,
        maxWasmMemoryUsage: 6e6,
        initialMemory,
        newMemory,
      });
    },
  );

  it(
    "should stabilize after repeated player instance disposal",
    { timeout: 45 * 60 * 1000, retry: 2 },
    async function () {
      await assertMemoryApisAvailable(workerHandle.telemetry);
      const initialMemory = await takeMemoryMeasurement(workerHandle.telemetry);
      player.dispose();
      workerHandle?.dispose();
      workerHandle = null;
      player = null;

      await runPlateauCheck({
        initialMemory,
        ...INSTANCE_PLATEAU_CONFIG,
        measure: async () => {
          workerHandle = createTestWorker(MEMORY_TELEMETRY_OPTIONS);
          player = new WaspHlsPlayer(videoElement, {});
          await player.initialize({
            workerUrl: workerHandle.url,
            wasmUrl: EmbeddedWasm,
          });
          const measurement = await takeMemoryMeasurement(
            workerHandle.telemetry,
          );
          player.dispose();
          workerHandle.dispose();
          workerHandle = null;
          player = null;
          return measurement;
        },
        iterate: async () => {
          const iterationWorkerHandle = createTestWorker({
            ...MEMORY_TELEMETRY_OPTIONS,
          });
          const iterationPlayer = new WaspHlsPlayer(videoElement, {});
          iterationPlayer.addEventListener("error", (error) => {
            lastPlayerError = error;
          });
          await iterationPlayer.initialize({
            workerUrl: iterationWorkerHandle.url,
            wasmUrl: EmbeddedWasm,
          });
          await loadAndWaitUntilPlayable(
            iterationPlayer,
            videoElement,
            getVodScenarioUrl(MEMORY_VOD_SCENARIO),
            () => lastPlayerError,
          );
          iterationPlayer.dispose();
          iterationWorkerHandle.dispose();
        },
      });

      workerHandle = createTestWorker(MEMORY_TELEMETRY_OPTIONS);
      player = new WaspHlsPlayer(videoElement, {});
      await player.initialize({
        workerUrl: workerHandle.url,
        wasmUrl: EmbeddedWasm,
      });
    },
  );

  it(
    "should not have a sensible memory leak after many video quality switches",
    { timeout: 45 * 60 * 1000, retry: 2 },
    async function () {
      await assertMemoryApisAvailable(workerHandle.telemetry);
      const maxIterations = 1000;
      await sleep(1000);
      player.updateConfig({ bufferGoal: 5 });
      await loadAndWaitUntilPlayable(
        player,
        videoElement,
        getVodScenarioUrl(MEMORY_VOD_SCENARIO),
        () => lastPlayerError,
      );
      await player.resume();
      const variantList = player.getVariantList();
      if (variantList.length <= 1) {
        throw new Error(
          "Not enough variants to perform sufficiently pertinent tests",
        );
      }
      const initialMemory = await takeMemoryMeasurement(workerHandle.telemetry);

      for (let iterationIdx = 0; iterationIdx < maxIterations; iterationIdx++) {
        player.seek(0);
        const idx = iterationIdx % variantList.length;
        const variantId = variantList[idx].id;
        player.lockVariant(variantId);
        await sleep(500);
        await waitForVariant(player, variantId);
      }
      await sleep(MEASUREMENT_SETTLE_MS);
      const newMemory = await takeMemoryMeasurement(workerHandle.telemetry);
      displayResultAndCheckLimit({
        maxTotalMemoryUsage: 6e6,
        maxWasmMemoryUsage: 4e6,
        initialMemory,
        newMemory,
      });
    },
  );

  it(
    "should not have a sensible memory leak after playing a live content for 5 minutes",
    { timeout: 22.5 * 60 * 1000, retry: 2 },
    async function () {
      await assertMemoryApisAvailable(workerHandle.telemetry);
      await startLivePackager();
      try {
        const livePlaylistInfo = await waitForPackagerReady();
        const initialMemory = await takeMemoryMeasurement(
          workerHandle.telemetry,
        );
        player.load(livePlaylistInfo.playlistUrl);
        await waitForLoadedState(player, videoElement, () => lastPlayerError);
        await player.resume();
        await sleep(5 * 60 * 1000);
        player.stop();
        await sleep(MEASUREMENT_SETTLE_MS);
        const newMemory = await takeMemoryMeasurement(workerHandle.telemetry);
        displayResultAndCheckLimit({
          maxTotalMemoryUsage: 10e6,
          maxWasmMemoryUsage: 8e6,
          initialMemory,
          newMemory,
        });
      } finally {
        await stopLivePackager();
      }
    },
  );
});

async function loadAndWaitUntilPlayable(
  player,
  videoElement,
  url,
  lastPlayerErrorRef,
) {
  player.load(url);
  await waitForLoadedState(player, videoElement, lastPlayerErrorRef);
}

function displayResultAndCheckLimit({
  maxTotalMemoryUsage,
  maxWasmMemoryUsage,
  initialMemory,
  newMemory,
}) {
  const totalDifference =
    newMemory.totalMemoryBytes - initialMemory.totalMemoryBytes;
  const wasmDifference =
    newMemory.workerWasmMemoryBytes === null ||
    initialMemory.workerWasmMemoryBytes === null
      ? null
      : newMemory.workerWasmMemoryBytes - initialMemory.workerWasmMemoryBytes;

  console.log(`
      ===========================================================
      | Current total memory (B)  | ${newMemory.totalMemoryBytes}
      | Initial total memory (B)  | ${initialMemory.totalMemoryBytes}
      | Total difference (B)      | ${totalDifference}
      | Current page UASM (B)     | ${newMemory.pageUserAgentSpecificBytes ?? "n/a"}
      | Initial page UASM (B)     | ${initialMemory.pageUserAgentSpecificBytes ?? "n/a"}
      | Current page heap (B)     | ${newMemory.pageJsHeapUsedBytes ?? "n/a"}
      | Initial page heap (B)     | ${initialMemory.pageJsHeapUsedBytes ?? "n/a"}
      | Current breakdown entries | ${newMemory.breakdownEntryCount ?? "n/a"}
      | Initial breakdown entries | ${initialMemory.breakdownEntryCount ?? "n/a"}
      | Current wasm memory (B)   | ${newMemory.workerWasmMemoryBytes ?? "n/a"}
      | Initial wasm memory (B)   | ${initialMemory.workerWasmMemoryBytes ?? "n/a"}
      | Wasm difference (B)       | ${wasmDifference ?? "n/a"}
    `);
  expect(totalDifference).to.be.below(maxTotalMemoryUsage);
  if (wasmDifference !== null) {
    expect(wasmDifference).to.be.below(maxWasmMemoryUsage);
  }
}

async function runPlateauCheck({
  initialMemory,
  totalIterations,
  batchSize,
  maxCheckpointTotalMemoryUsage,
  maxCheckpointWasmMemoryUsage,
  iterate,
  measure,
}) {
  if (totalIterations % batchSize !== 0) {
    throw new Error("totalIterations should be divisible by batchSize");
  }

  for (let iterationIdx = 0; iterationIdx < totalIterations; iterationIdx++) {
    await iterate(iterationIdx);
    const currentIteration = iterationIdx + 1;
    if (currentIteration % batchSize !== 0) {
      continue;
    }

    await sleep(MEASUREMENT_SETTLE_MS);
    const checkpointMemory = await measure();
    displayResultAndCheckLimit({
      maxTotalMemoryUsage: maxCheckpointTotalMemoryUsage,
      maxWasmMemoryUsage: maxCheckpointWasmMemoryUsage,
      initialMemory,
      newMemory: checkpointMemory,
    });
  }
}

function waitForVariant(player, variantId) {
  return new Promise((resolve, reject) => {
    const reCheck = () => {
      if (
        player.getCurrentVariant()?.id === variantId &&
        player.getPlayerState() === "Loaded"
      ) {
        player.removeEventListener("variantUpdate", reCheck);
        player.removeEventListener("playerStateChange", reCheck);
        resolve();
      } else {
        const err = player.getError();
        if (err !== null) {
          reject(new Error(`Wasp-HLS failed while switching variant: ${err}`));
        }
      }
    };
    reCheck();
    player.addEventListener("variantUpdate", reCheck);
    player.addEventListener("playerStateChange", reCheck);
  });
}

async function waitForPlaybackProgress(
  videoElement,
  minimumSeconds,
  timeoutMs,
) {
  const startTime = performance.now();
  while (performance.now() - startTime < timeoutMs) {
    if (videoElement.currentTime >= minimumSeconds) {
      return;
    }
    await sleep(250);
  }
  throw new Error(
    `Timed out waiting for playback progress: currentTime=${videoElement.currentTime}`,
  );
}
