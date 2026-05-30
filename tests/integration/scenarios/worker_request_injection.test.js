import { describe, expect, it } from "vitest";
import setupPlayer from "../utils/player_setup.js";
import { createTestWorker } from "../utils/create_test_worker.js";
import { waitForPlayerEvent } from "../utils/player_test_tools.js";
import { getVodScenarioUrl } from "../utils/vod_scenarios.js";

const TEST_TIMEOUT_MS = 60_000;

describe("Worker request injection", function () {
  describe(
    "when a multivariant playlist request fails in the worker",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      const ctx = setupPlayer({
        playerConfig: {
          multiVariantPlaylistMaxRetry: 0,
        },
        createWorker() {
          return createTestWorker({
            fetchRules: [
              {
                id: "master-playlist",
                match: {
                  urlEndsWith:
                    "/vod/scenario/fmp4-multivariant-no-codecs/master.m3u8",
                },
                actions: [
                  { type: "error", message: "Injected top-level failure" },
                ],
              },
            ],
          });
        },
      });

      it("surfaces the documented network error", async () => {
        const errorPromise = waitForPlayerEvent(ctx.player, "error");
        ctx.player.load(getVodScenarioUrl("fmp4-multivariant-no-codecs"));

        const error = await errorPromise;
        expect(error.name).toBe("WaspMultivariantPlaylistRequestError");
        expect(error.code).toBe("MultivariantPlaylistRequestError");

        const rejectionEvent = await ctx.workerHandle.telemetry.waitFor(
          (evt) =>
            evt.type === "fetch-reject" && evt.ruleId === "master-playlist",
        );
        expect(rejectionEvent.actionType).toBe("error");
      });
    },
  );

  describe(
    "when a multivariant playlist request times out in the worker",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      const ctx = setupPlayer({
        playerConfig: {
          multiVariantPlaylistMaxRetry: 0,
          multiVariantPlaylistRequestTimeout: 50,
          multiVariantPlaylistBackoffBase: 1,
          multiVariantPlaylistBackoffMax: 1,
        },
        createWorker() {
          return createTestWorker({
            fetchRules: [
              {
                id: "master-playlist-timeout",
                match: {
                  urlEndsWith:
                    "/vod/scenario/fmp4-multivariant-no-codecs/master.m3u8",
                },
                actions: [{ type: "timeout" }],
              },
            ],
          });
        },
      });

      it("surfaces the documented timeout error", async () => {
        const errorPromise = waitForPlayerEvent(ctx.player, "error");
        ctx.player.load(getVodScenarioUrl("fmp4-multivariant-no-codecs"));

        const error = await errorPromise;
        expect(error.name).toBe("WaspMultivariantPlaylistRequestError");
        expect(error.code).toBe("MultivariantPlaylistRequestTimeout");

        const timeoutEvent = await ctx.workerHandle.telemetry.waitFor(
          (evt) =>
            evt.type === "fetch-abort" &&
            evt.ruleId === "master-playlist-timeout",
        );
        expect(timeoutEvent.actionType).toBe("timeout");
      });
    },
  );
});
