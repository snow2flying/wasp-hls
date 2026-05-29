import { describe, expect, it } from "vitest";
import sleep from "../../utils/sleep.js";
import setupPlayer from "../utils/player_setup";
import {
  waitForLoadedState,
  waitForPlayerEvent,
} from "../utils/player_test_tools.js";
import { getVodScenarioUrl } from "../utils/vod_scenarios.js";

const TEST_TIMEOUT_MS = 60_000;
const LEAK_OBSERVATION_WINDOW_MS = 1_000;
const TRACKLESS_SCENARIO = "fmp4-player-api";
const AUDIO_SCENARIO = "fmp4-alt-audio";
const VARIANT_SCENARIO = "fmp4-multivariant-no-codecs";
const PROGRAM_DATE_TIME_SCENARIO = "fmp4-player-api-program-date-time";
const RECORDED_EVENTS = [
  "playerStateChange",
  "audioTrackListUpdate",
  "audioTrackUpdate",
  "variantListUpdate",
  "variantUpdate",
  "contentInfoUpdate",
  "warning",
  "error",
  "playing",
  "paused",
  "ended",
  "rebufferingStarted",
  "rebufferingEnded",
];

function createEventRecorder(player) {
  const perEvent = Object.fromEntries(
    RECORDED_EVENTS.map((eventName) => [eventName, []]),
  );

  for (const eventName of RECORDED_EVENTS) {
    player.addEventListener(eventName, (payload) => {
      perEvent[eventName].push(payload);
    });
  }

  return {
    counts() {
      return Object.fromEntries(
        RECORDED_EVENTS.map((eventName) => [
          eventName,
          perEvent[eventName].length,
        ]),
      );
    },
    payloadsSince(eventName, snapshot) {
      return perEvent[eventName].slice(snapshot[eventName] ?? 0);
    },
  };
}

function triggerActionOnFirstMatchingEvent(
  player,
  recorder,
  eventName,
  predicate,
  action,
) {
  return new Promise((resolve) => {
    let hasTriggered = false;
    player.addEventListener(eventName, (payload) => {
      if (hasTriggered || !predicate(payload)) {
        return;
      }
      hasTriggered = true;
      const snapshot = recorder.counts();
      action(payload);
      resolve(snapshot);
    });
  });
}

function expectNoFatalOrStoppedState(states) {
  expect(states).not.toContain("Stopped");
  expect(states).not.toContain("Error");
}

function expectOnlyEmptyAudioAnnouncements(payloads) {
  expect(payloads.every((payload) => payload === undefined)).toEqual(true);
}

function expectOnlyEmptyAudioLists(payloads) {
  expect(
    payloads.every((payload) => Array.isArray(payload) && payload.length === 0),
  ).toEqual(true);
}

function expectOnlyEmptyVariantAnnouncements(payloads) {
  expect(payloads.every((payload) => payload === undefined)).toEqual(true);
}

function expectOnlyMatchingVariantLists(payloads, expectedPayload) {
  for (const payload of payloads) {
    expect(payload).toEqual(expectedPayload);
  }
}

async function waitForStoppedState(player) {
  if (player.getPlayerState() === "Stopped") {
    return;
  }
  await waitForPlayerEvent(
    player,
    "playerStateChange",
    (state) => state === "Stopped",
  );
}

describe("Content switching and stopping from player events", function () {
  const ctx = setupPlayer();

  const loadCases = [
    {
      name: "switches content directly from audioTrackListUpdate without leaking previous audio-track events",
      eventName: "audioTrackListUpdate",
      initialScenario: AUDIO_SCENARIO,
      nextScenario: TRACKLESS_SCENARIO,
      predicate: () => true,
      assertPostSwitch(recorder, snapshot) {
        expectOnlyEmptyAudioLists(
          recorder.payloadsSince("audioTrackListUpdate", snapshot),
        );
        expectOnlyEmptyAudioAnnouncements(
          recorder.payloadsSince("audioTrackUpdate", snapshot),
        );
      },
      assertFinalState(player) {
        expect(player.getAudioTrackList()).toEqual([]);
        expect(player.getCurrentAudioTrack()).toBeUndefined();
      },
    },
    {
      name: "switches content directly from audioTrackUpdate without leaking previous audio-track events",
      eventName: "audioTrackUpdate",
      initialScenario: AUDIO_SCENARIO,
      nextScenario: TRACKLESS_SCENARIO,
      predicate: (payload) => payload !== undefined,
      assertPostSwitch(recorder, snapshot) {
        expectOnlyEmptyAudioAnnouncements(
          recorder.payloadsSince("audioTrackUpdate", snapshot),
        );
      },
      assertFinalState(player) {
        expect(player.getAudioTrackList()).toEqual([]);
        expect(player.getCurrentAudioTrack()).toBeUndefined();
      },
    },
    {
      name: "switches content directly from variantListUpdate without leaking previous variant events",
      eventName: "variantListUpdate",
      initialScenario: VARIANT_SCENARIO,
      nextScenario: TRACKLESS_SCENARIO,
      predicate: () => true,
      assertPostSwitch(recorder, snapshot, player) {
        expectOnlyMatchingVariantLists(
          recorder.payloadsSince("variantListUpdate", snapshot),
          player.getVariantList(),
        );
        for (const payload of recorder.payloadsSince(
          "variantUpdate",
          snapshot,
        )) {
          expect(payload).toEqual(player.getCurrentVariant());
        }
      },
      assertFinalState(player) {
        const variantList = player.getVariantList();
        const currentVariant = player.getCurrentVariant();
        expect(variantList.length).toBeGreaterThan(0);
        expect(currentVariant).toBeDefined();
        expect(variantList).toContainEqual(currentVariant);
      },
    },
    {
      name: "switches content directly from variantUpdate without leaking previous variant events",
      eventName: "variantUpdate",
      initialScenario: VARIANT_SCENARIO,
      nextScenario: TRACKLESS_SCENARIO,
      predicate: (payload) => payload !== undefined,
      assertPostSwitch(recorder, snapshot, player) {
        const payloads = recorder.payloadsSince("variantUpdate", snapshot);
        for (const payload of payloads) {
          expect(payload).toEqual(player.getCurrentVariant());
        }
      },
      assertFinalState(player) {
        const variantList = player.getVariantList();
        const currentVariant = player.getCurrentVariant();
        expect(variantList.length).toBeGreaterThan(0);
        expect(currentVariant).toBeDefined();
        expect(variantList).toContainEqual(currentVariant);
      },
    },
    {
      name: "switches content directly from contentInfoUpdate without leaking previous content info",
      eventName: "contentInfoUpdate",
      initialScenario: PROGRAM_DATE_TIME_SCENARIO,
      nextScenario: TRACKLESS_SCENARIO,
      predicate: (payload) => payload.usesProgramDateTime === true,
      assertPostSwitch(recorder, snapshot) {
        const payloads = recorder.payloadsSince("contentInfoUpdate", snapshot);
        expect(payloads.length).toBeGreaterThan(0);
        expect(
          payloads.every((payload) => payload.usesProgramDateTime === false),
        ).toEqual(true);
      },
      assertFinalState(player) {
        expect(player.usesProgramDateTime()).toEqual(false);
        expect(player.positionToDate(1)).toBeUndefined();
      },
    },
  ];

  for (const testCase of loadCases) {
    it(testCase.name, { timeout: TEST_TIMEOUT_MS }, async () => {
      const recorder = createEventRecorder(ctx.player);
      const switchSnapshotPromise = triggerActionOnFirstMatchingEvent(
        ctx.player,
        recorder,
        testCase.eventName,
        testCase.predicate,
        () => {
          ctx.player.load(getVodScenarioUrl(testCase.nextScenario));
        },
      );

      ctx.player.load(getVodScenarioUrl(testCase.initialScenario));
      const switchSnapshot = await switchSnapshotPromise;
      await waitForLoadedState(
        ctx.player,
        ctx.videoElement,
        () => ctx.lastPlayerError,
      );
      await sleep(LEAK_OBSERVATION_WINDOW_MS);

      const postSwitchStates = recorder.payloadsSince(
        "playerStateChange",
        switchSnapshot,
      );
      expect(postSwitchStates).toContain("Loading");
      expect(postSwitchStates).toContain("Loaded");
      expectNoFatalOrStoppedState(postSwitchStates);
      expect(recorder.payloadsSince("warning", switchSnapshot)).toEqual([]);
      expect(recorder.payloadsSince("error", switchSnapshot)).toEqual([]);

      testCase.assertPostSwitch(recorder, switchSnapshot, ctx.player);
      testCase.assertFinalState(ctx.player);
    });
  }

  const stopCases = [
    {
      name: "stops directly from audioTrackListUpdate without leaking previous audio-track events",
      eventName: "audioTrackListUpdate",
      initialScenario: AUDIO_SCENARIO,
      predicate: () => true,
      assertPostStop(recorder, snapshot) {
        expect(recorder.payloadsSince("audioTrackUpdate", snapshot)).toEqual(
          [],
        );
        expect(
          recorder.payloadsSince("audioTrackListUpdate", snapshot),
        ).toEqual([]);
      },
    },
    {
      name: "stops directly from audioTrackUpdate without leaking previous audio-track events",
      eventName: "audioTrackUpdate",
      initialScenario: AUDIO_SCENARIO,
      predicate: (payload) => payload !== undefined,
      assertPostStop(recorder, snapshot) {
        expect(recorder.payloadsSince("audioTrackUpdate", snapshot)).toEqual(
          [],
        );
      },
    },
    {
      name: "stops directly from variantListUpdate without leaking previous variant events",
      eventName: "variantListUpdate",
      initialScenario: VARIANT_SCENARIO,
      predicate: () => true,
      assertPostStop(recorder, snapshot) {
        expect(recorder.payloadsSince("variantUpdate", snapshot)).toEqual([]);
        expect(recorder.payloadsSince("variantListUpdate", snapshot)).toEqual(
          [],
        );
      },
    },
    {
      name: "stops directly from variantUpdate without leaking previous variant events",
      eventName: "variantUpdate",
      initialScenario: VARIANT_SCENARIO,
      predicate: (payload) => payload !== undefined,
      assertPostStop(recorder, snapshot) {
        expect(recorder.payloadsSince("variantUpdate", snapshot)).toEqual([]);
      },
    },
    {
      name: "stops directly from contentInfoUpdate without leaking previous content info",
      eventName: "contentInfoUpdate",
      initialScenario: PROGRAM_DATE_TIME_SCENARIO,
      predicate: (payload) => payload.usesProgramDateTime === true,
      assertPostStop(recorder, snapshot) {
        expect(recorder.payloadsSince("contentInfoUpdate", snapshot)).toEqual(
          [],
        );
      },
    },
  ];

  for (const testCase of stopCases) {
    it(testCase.name, { timeout: TEST_TIMEOUT_MS }, async () => {
      const recorder = createEventRecorder(ctx.player);
      const stopSnapshotPromise = triggerActionOnFirstMatchingEvent(
        ctx.player,
        recorder,
        testCase.eventName,
        testCase.predicate,
        () => {
          ctx.player.stop();
        },
      );

      ctx.player.load(getVodScenarioUrl(testCase.initialScenario));
      const stopSnapshot = await stopSnapshotPromise;
      await waitForStoppedState(ctx.player);
      await sleep(LEAK_OBSERVATION_WINDOW_MS);

      const postStopStates = recorder.payloadsSince(
        "playerStateChange",
        stopSnapshot,
      );
      expect(postStopStates).toContain("Stopped");
      expect(postStopStates).not.toContain("Loaded");
      expect(postStopStates).not.toContain("Error");
      expect(recorder.payloadsSince("warning", stopSnapshot)).toEqual([]);
      expect(recorder.payloadsSince("error", stopSnapshot)).toEqual([]);
      expect(ctx.player.getPlayerState()).toEqual("Stopped");
      expect(ctx.player.getAudioTrackList()).toEqual([]);
      expect(ctx.player.getCurrentAudioTrack()).toBeUndefined();
      expect(ctx.player.getVariantList()).toEqual([]);
      expect(ctx.player.getCurrentVariant()).toBeUndefined();

      testCase.assertPostStop(recorder, stopSnapshot);
    });
  }
});
