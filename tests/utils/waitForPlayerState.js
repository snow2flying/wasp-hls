/**
 * Wait for the "Loaded" state just after ``load`` is called.
 * Reject if the state is neither "Loading" nor "Loaded".
 * @param {WaspHlsPlayer} player
 * @returns {Promise}
 */
export async function waitForLoadedStateAfterLoad(player) {
  try {
    await waitForState(player, "Loaded", ["Loading"]);
  } catch (err) {
    if (player.getPlayerState() !== "Stopped") {
      return;
    }
    const playerError = player.getError();
    if (playerError !== null) {
      throw playerError;
    }
  }
}

/**
 * Wait for the given state on the player.
 *
 * If a whitelist is set, reject if the state is not in it. You do not have to
 * put the wanted state in that list.
 * @param {WaspHlsPlayer} player
 * @param {string} state
 * @param {Array.<string>} [whitelist]
 * @returns {Promise}
 */
export default function waitForState(player, wantedState, whitelist) {
  return new Promise((resolve, reject) => {
    function onPlayerStateChange(state) {
      if (wantedState === state) {
        player.removeEventListener("playerStateChange", onPlayerStateChange);
        resolve();
      } else if (whitelist && !whitelist.includes(state)) {
        if (state === "Stopped") {
          const playerError = player.getError();
          if (playerError !== null) {
            reject(playerError);
            return;
          }
        }
        reject(new Error("invalid state: " + state));
      }
    }
    player.addEventListener("playerStateChange", onPlayerStateChange);
  });
}
