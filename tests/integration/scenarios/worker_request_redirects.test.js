import { describe, expect, it } from "vitest";
import { waitForLoadedState } from "../../utils/player_test_tools.js";
import { getVodScenarioUrl } from "../../utils/vod_scenarios.js";
import {
  createPlayerHarness,
  TEST_TIMEOUT_MS,
} from "../utils/request_integration_test_tools.js";

describe("Worker request injection - redirects", function () {
  it(
    "uses the redirected multivariant playlist URL as the base for subsequent playlist requests",
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const ctx = await createPlayerHarness({ fetchRules: [] });

      try {
        ctx.player.addEventListener("playerStateChange", (state) => {
          if (state === "Loaded") {
            ctx.player.resume();
          }
        });

        ctx.player.load(getVodScenarioUrl("fmp4-multivariant-master-redirect"));
        await waitForLoadedState(ctx.player, ctx.videoElement, () =>
          ctx.getLastPlayerError(),
        );

        const redirectedMasterResolve =
          await ctx.workerHandle.telemetry.waitFor(
            (evt) =>
              evt.type === "fetch-resolve" &&
              evt.url.endsWith(
                "/vod/scenario/fmp4-multivariant-master-redirect/master.m3u8",
              ),
          );
        expect(redirectedMasterResolve.finalUrl).toMatch(
          /\/vod\/scenario\/fmp4-multivariant-master-redirect\/redirected\/master\.m3u8$/,
        );

        const redirectedVariantRequest =
          await ctx.workerHandle.telemetry.waitFor((evt) => {
            return (
              evt.type === "fetch-start" &&
              evt.url.endsWith(
                "/vod/scenario/fmp4-multivariant-master-redirect/redirected/variant.m3u8",
              )
            );
          });

        expect(redirectedVariantRequest).toBeDefined();
      } finally {
        ctx.dispose();
      }
    },
  );

  it(
    "uses the redirected media playlist URL as the base for subsequent segment requests",
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const ctx = await createPlayerHarness({ fetchRules: [] });

      try {
        ctx.player.addEventListener("playerStateChange", (state) => {
          if (state === "Loaded") {
            ctx.player.resume();
          }
        });

        ctx.player.load(getVodScenarioUrl("fmp4-direct-media-redirect"));
        await waitForLoadedState(ctx.player, ctx.videoElement, () =>
          ctx.getLastPlayerError(),
        );

        const redirectedPlaylistResolve =
          await ctx.workerHandle.telemetry.waitFor(
            (evt) =>
              evt.type === "fetch-resolve" &&
              evt.url.endsWith(
                "/vod/scenario/fmp4-direct-media-redirect/playlist.m3u8",
              ),
          );
        expect(redirectedPlaylistResolve.finalUrl).toMatch(
          /\/vod\/scenario\/fmp4-direct-media-redirect\/redirected\/playlist\.m3u8$/,
        );

        const redirectedSegmentRequest =
          await ctx.workerHandle.telemetry.waitFor((evt) => {
            return (
              evt.type === "fetch-start" &&
              /\/vod\/scenario\/fmp4-direct-media-redirect\/redirected\/(init\.mp4|seg-[0-9]+\.m4s)$/.test(
                evt.url,
              )
            );
          });

        expect(redirectedSegmentRequest).toBeDefined();
      } finally {
        ctx.dispose();
      }
    },
  );
});
