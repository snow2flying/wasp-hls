import { describe, expect, it } from "vitest";
import setupPlayer from "../utils/player_setup";
import {
  eventListener,
  waitForLoadedState,
} from "../utils/player_test_tools.js";
import { getVodScenarioUrl } from "../utils/vod_scenarios.js";

const VOD_TEST_TIMEOUT_MS = 60_000;

describe("Generated VoD content - audio tracks", function () {
  const ctx = setupPlayer();

  it(
    "exposes alternate audio tracks through the player API",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      const audioTrackListListener = eventListener(
        ctx.player,
        "audioTrackListUpdate",
      );
      const audioTrackListener = eventListener(ctx.player, "audioTrackUpdate");

      ctx.player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          ctx.player.resume();
        }
      });

      ctx.player.load(getVodScenarioUrl("fmp4-alt-audio"));
      const announcedTracks = await audioTrackListListener.awaitNext();
      const announcedAudioTrack = await audioTrackListener.awaitNext();
      expect(ctx.player.getPlayerState()).toEqual("Loading");
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
      expect(announcedTracks).toEqual(audioTracks);
      expect(announcedAudioTrack).toEqual(currentTrack);
      expect(audioTrackListListener.getCurrentCount()).toEqual(1);
      expect(audioTrackListener.getCurrentCount()).toEqual(1);
    },
  );

  it(
    "does not announce audio tracks for muxed direct media playlists",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      const audioTrackListListener = eventListener(
        ctx.player,
        "audioTrackListUpdate",
      );
      const audioTrackListener = eventListener(ctx.player, "audioTrackUpdate");

      ctx.player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          ctx.player.resume();
        }
      });

      ctx.player.load(getVodScenarioUrl("fmp4-direct-media"));
      const announcedTracks = await audioTrackListListener.awaitNext();
      const announcedAudioTrack = await audioTrackListener.awaitNext();
      expect(ctx.player.getPlayerState()).toEqual("Loading");
      await waitForLoadedState(
        ctx.player,
        ctx.videoElement,
        () => ctx.lastPlayerError,
      );

      expect(announcedTracks).toEqual([]);
      expect(announcedAudioTrack).toEqual(undefined);
      expect(ctx.player.getAudioTrackList()).toEqual([]);
      expect(ctx.player.getCurrentAudioTrack()).toBeUndefined();
      expect(audioTrackListListener.getCurrentCount()).toEqual(1);
      expect(audioTrackListener.getCurrentCount()).toEqual(1);
    },
  );

  it(
    "does not announce audio tracks for shared muxed multivariant playlists",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      const audioTrackListListener = eventListener(
        ctx.player,
        "audioTrackListUpdate",
      );
      const audioTrackListener = eventListener(ctx.player, "audioTrackUpdate");

      ctx.player.addEventListener("playerStateChange", (state) => {
        if (state === "Loaded") {
          ctx.player.resume();
        }
      });

      ctx.player.load(getVodScenarioUrl("fmp4-shared-audio-muxed"));
      const announcedTracks = await audioTrackListListener.awaitNext();
      const announcedAudioTrack = await audioTrackListener.awaitNext();
      expect(ctx.player.getPlayerState()).toEqual("Loading");
      await waitForLoadedState(
        ctx.player,
        ctx.videoElement,
        () => ctx.lastPlayerError,
      );

      expect(announcedTracks).toEqual([]);
      expect(announcedAudioTrack).toEqual(undefined);
      expect(ctx.player.getAudioTrackList()).toEqual([]);
      expect(ctx.player.getCurrentAudioTrack()).toBeUndefined();
      expect(audioTrackListListener.getCurrentCount()).toEqual(1);
      expect(audioTrackListener.getCurrentCount()).toEqual(1);
    },
  );

  it(
    "switches alternate audio tracks through setAudioTrack",
    { timeout: VOD_TEST_TIMEOUT_MS },
    async () => {
      const audioTrackListListener = eventListener(
        ctx.player,
        "audioTrackListUpdate",
      );
      const audioTrackListener = eventListener(ctx.player, "audioTrackUpdate");

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

      ctx.player.setAudioTrack(frenchTrack.id);
      const switchedTrack = await audioTrackListener.awaitNext();

      expect(switchedTrack.language).toEqual("fr");
      expect(ctx.player.getCurrentAudioTrack()?.id).toEqual(frenchTrack.id);
      expect(audioTrackListListener.getCurrentCount()).toEqual(1);
      expect(audioTrackListener.getCurrentCount()).toEqual(2);
    },
  );
});
