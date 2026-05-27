import sleep from "../../utils/sleep.js";
import { waitForLoadedStateAfterLoad } from "../../utils/waitForPlayerState.js";

const PLAYER_LOAD_TIMEOUT_MS = 90_000;

export function getPlayerStateSnapshot(player, videoElement, lastPlayerError) {
  return {
    playerState: player.getPlayerState(),
    playerError: player.getError() ?? lastPlayerError,
    position: player.getPosition(),
    minimumPosition: player.getMinimumPosition(),
    maximumPosition: player.getMaximumPosition(),
    seekableMinimumPosition: player.getSeekableMinimumPosition(),
    seekableMaximumPosition: player.getSeekableMaximumPosition(),
    currentTime: videoElement.currentTime,
    readyState: videoElement.readyState,
    networkState: videoElement.networkState,
    paused: videoElement.paused,
    ended: videoElement.ended,
  };
}

export async function waitForLoadedState(
  player,
  videoElement,
  lastPlayerErrorRef,
) {
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

export function waitForPlayerEvent(
  player,
  eventName,
  predicate = () => true,
  timeoutMs = 20_000,
) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for player event "${eventName}"`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeoutId);
      player.removeEventListener(eventName, onEvent);
    }

    function onEvent(eventValue) {
      if (!predicate(eventValue)) {
        return;
      }
      cleanup();
      resolve(eventValue);
    }

    player.addEventListener(eventName, onEvent);
  });
}
