import { describe, expect, it } from "vitest";
import sleep from "../../utils/sleep.js";
import { checkAfterSleepWithBackoff } from "../../utils/checkAfterSleepWithBackoff.js";
import setupPlayer from "../utils/player_setup";
import { waitForLoadedState } from "../utils/player_test_tools.js";

const LIVE_ENDLIST_TEST_TIMEOUT_MS = 90_000;
const EVENT_ENDLIST_SCENARIO_PREFIX = "/live/scenario/event-endlist";

function getBaseUrl() {
  return (
    "http://" + __TEST_CONTENT_SERVER__.URL + ":" + __TEST_CONTENT_SERVER__.PORT
  );
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Unexpected status ${response.status} for ${url}`);
  }
  return await response.json();
}

async function resetEventEndlistScenario() {
  return await fetchJson(
    `${getBaseUrl()}${EVENT_ENDLIST_SCENARIO_PREFIX}/reset`,
    {
      method: "POST",
    },
  );
}

describe("Live content - EXT-X-ENDLIST", function () {
  const ctx = setupPlayer();

  it(
    "plays through an EVENT playlist that ends with EXT-X-ENDLIST",
    { timeout: LIVE_ENDLIST_TEST_TIMEOUT_MS },
    async () => {
      const { playlistUrl } = await resetEventEndlistScenario();

      let receivedEndedEvent = 0;
      ctx.player.addEventListener("ended", () => {
        receivedEndedEvent++;
      });

      ctx.player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          ctx.player.resume();
        }
      });

      ctx.player.load(playlistUrl);
      await waitForLoadedState(
        ctx.player,
        ctx.videoElement,
        () => ctx.lastPlayerError,
      );

      const initialMaximumPosition = ctx.player.getMaximumPosition();

      await sleep(2_500);
      const maximumPositionAfterRefresh = ctx.player.getMaximumPosition();
      expect(maximumPositionAfterRefresh).toBeGreaterThan(
        (initialMaximumPosition ?? 0) + 1.5,
      );

      // TODO: Once we have a supported worker-to-main test hook for network
      // requests, assert directly that playlist reloads stop after ENDLIST.
      await checkAfterSleepWithBackoff(
        { minTimeMs: 2_000, maxTimeMs: 20_000, stepMs: 1_000 },
        () => {
          expect(ctx.player.getPosition()).toBeGreaterThan(11.5);
          expect(ctx.lastPlayerError).toEqual(null);
        },
      );

      expect(receivedEndedEvent).toEqual(0);
      await checkAfterSleepWithBackoff(
        { minTimeMs: 2_000, maxTimeMs: 20_000, stepMs: 1_000 },
        () => {
          expect(ctx.player.isEnded()).toEqual(true);
          expect(receivedEndedEvent).toEqual(1);
          expect(ctx.player.getPosition()).toBeCloseTo(
            ctx.player.getMaximumPosition(),
            0.5,
          );
          expect(ctx.lastPlayerError).toEqual(null);
        },
      );
    },
  );
});
