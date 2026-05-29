import { describe, expect, it } from "vitest";
import setupPlayer from "../utils/player_setup";
import { waitForPlayerEvent } from "../utils/player_test_tools.js";
import { getVodScenarioUrl } from "../utils/vod_scenarios.js";

const TEST_TIMEOUT_MS = 60_000;

async function expectLoadError(ctx, scenarioId, expectedName, expectedCode) {
  const errorPromise = waitForPlayerEvent(ctx.player, "error");
  const stoppedPromise = waitForPlayerEvent(
    ctx.player,
    "playerStateChange",
    (state) => state === "Error",
  );

  ctx.player.load(getVodScenarioUrl(scenarioId));

  const [error] = await Promise.all([errorPromise, stoppedPromise]);
  expect(error.name).toBe(expectedName);
  expect(error.code).toBe(expectedCode);
  expect(ctx.player.getError()).toBe(error);
  expect(ctx.player.getPlayerState()).toBe("Error");
}

describe("Playlist parsing errors", function () {
  const ctx = setupPlayer();

  it.each([
    [
      "fmp4-error-missing-target-duration",
      "WaspMediaPlaylistParsingError",
      "MediaPlaylistMissingTargetDuration",
    ],
    [
      "fmp4-error-unparsable-extinf",
      "WaspMediaPlaylistParsingError",
      "MediaPlaylistUnparsableExtInf",
    ],
    [
      "fmp4-error-uri-missing-in-map",
      "WaspMediaPlaylistParsingError",
      "MediaPlaylistUriMissingInMap",
    ],
    [
      "fmp4-error-uri-without-extinf",
      "WaspMediaPlaylistParsingError",
      "MediaPlaylistUriWithoutExtInf",
    ],
    [
      "fmp4-error-unparsable-byterange",
      "WaspMediaPlaylistParsingError",
      "MediaPlaylistUnparsableByteRange",
    ],
    [
      "fmp4-error-media-variable-definition",
      "WaspMediaPlaylistParsingError",
      "MediaPlaylistVariableDefinitionError",
    ],
    [
      "fmp4-error-media-duplicate-singleton",
      "WaspMediaPlaylistParsingError",
      "MediaPlaylistDuplicateTag",
    ],
    [
      "fmp4-error-media-conflicting-tag-types",
      "WaspMediaPlaylistParsingError",
      "MediaPlaylistConflictingTagTypes",
    ],
    [
      "fmp4-error-master-missing-uri-after-variant",
      "WaspMultivariantPlaylistParsingError",
      "MultivariantPlaylistMissingUriLineAfterVariant",
    ],
    [
      "fmp4-error-master-missing-uri-after-variant-comment",
      "WaspMultivariantPlaylistParsingError",
      "MultivariantPlaylistMissingUriLineAfterVariant",
    ],
    [
      "fmp4-error-master-variant-missing-bandwidth",
      "WaspMultivariantPlaylistParsingError",
      "MultivariantPlaylistVariantMissingBandwidth",
    ],
    [
      "fmp4-error-master-duplicate-singleton",
      "WaspMultivariantPlaylistParsingError",
      "MultivariantPlaylistDuplicateTag",
    ],
    [
      "fmp4-error-master-conflicting-tag-types",
      "WaspMultivariantPlaylistParsingError",
      "MultivariantPlaylistConflictingTagTypes",
    ],
    [
      "fmp4-error-master-invalid-value",
      "WaspMultivariantPlaylistParsingError",
      "MultivariantPlaylistInvalidValue",
    ],
    [
      "fmp4-error-master-missing-required-attribute",
      "WaspMultivariantPlaylistParsingError",
      "MultivariantPlaylistMissingRequiredAttribute",
    ],
    [
      "fmp4-error-master-variable-definition",
      "WaspMultivariantPlaylistParsingError",
      "MultivariantPlaylistVariableDefinitionError",
    ],
    [
      "fmp4-error-master-without-variant",
      "WaspMultivariantPlaylistParsingError",
      "MultivariantPlaylistWithoutVariant",
    ],
    [
      "fmp4-error-master-other-parsing-error",
      "WaspMultivariantPlaylistParsingError",
      "MultivariantPlaylistOtherParsingError",
    ],
    ["fmp4-error-top-level-missing-extm3u", "WaspOtherError", "NotAPlaylist"],
  ])(
    "surfaces %s as %s/%s",
    { timeout: TEST_TIMEOUT_MS },
    async (scenarioId, expectedName, expectedCode) => {
      await expectLoadError(ctx, scenarioId, expectedName, expectedCode);
    },
  );
});
