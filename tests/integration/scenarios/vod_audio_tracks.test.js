import { describe, expect, it } from "vitest";
import setupPlayer from "../utils/player_setup";
import {
  waitForLoadedState,
  waitForPlayerEvent,
} from "../utils/player_test_tools.js";
import { getVodScenarioUrl } from "../utils/vod_scenarios.js";

const VOD_TEST_TIMEOUT_MS = 60_000;

describe("Generated VoD content - audio tracks", function () {
  const ctx = setupPlayer();

  it(
    "exposes alternate audio tracks through the player API",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      ctx.player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          ctx.player.resume();
        }
      });

      ctx.player.load(getVodScenarioUrl("fmp4-alt-audio"));
      await waitForLoadedState(
        ctx.player,
        ctx.videoElement,
        () => ctx.lastPlayerError,
      );

      const audioTracks = ctx.player.getAudioTrackList();
      const currentTrack = ctx.player.getCurrentAudioTrack();

      expect(ctx.player.isVod()).toEqual(true);
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
    "does not announce audio tracks for muxed direct media playlists",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      ctx.player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          ctx.player.resume();
        }
      });

      const audioTrackListPromise = waitForPlayerEvent(
        ctx.player,
        "audioTrackListUpdate",
      );
      ctx.player.load(getVodScenarioUrl("fmp4-direct-media"));
      const announcedTracks = await audioTrackListPromise;
      await waitForLoadedState(
        ctx.player,
        ctx.videoElement,
        () => ctx.lastPlayerError,
      );

      expect(announcedTracks).toEqual([]);
      expect(ctx.player.getAudioTrackList()).toEqual([]);
      expect(ctx.player.getCurrentAudioTrack()).toBeUndefined();
    },
  );

  it(
    "does not announce audio tracks for shared muxed multivariant playlists",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      ctx.player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          ctx.player.resume();
        }
      });

      const audioTrackListPromise = waitForPlayerEvent(
        ctx.player,
        "audioTrackListUpdate",
      );
      ctx.player.load(getVodScenarioUrl("fmp4-shared-audio-muxed"));
      const announcedTracks = await audioTrackListPromise;
      await waitForLoadedState(
        ctx.player,
        ctx.videoElement,
        () => ctx.lastPlayerError,
      );

      expect(announcedTracks).toEqual([]);
      expect(ctx.player.getAudioTrackList()).toEqual([]);
      expect(ctx.player.getCurrentAudioTrack()).toBeUndefined();
    },
  );

  it(
    "switches alternate audio tracks through setAudioTrack",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      ctx.player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          ctx.player.resume();
        }
      });

      ctx.player.load(getVodScenarioUrl("fmp4-alt-audio"));
      await waitForLoadedState(
        ctx.player,
        ctx.videoElement,
        () => ctx.lastPlayerError,
      );

      const frenchTrack = ctx.player
        .getAudioTrackList()
        .find((track) => track.language === "fr");
      expect(frenchTrack).toBeDefined();

      const switchedTrackPromise = waitForPlayerEvent(
        ctx.player,
        "audioTrackUpdate",
        (track) => track?.id === frenchTrack?.id,
      );
      ctx.player.setAudioTrack(frenchTrack.id);
      const switchedTrack = await switchedTrackPromise;

      expect(switchedTrack.language).toEqual("fr");
      expect(ctx.player.getCurrentAudioTrack()?.id).toEqual(frenchTrack.id);
    },
  );
});
