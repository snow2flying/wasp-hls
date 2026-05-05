import logger from "../ts-common/logger.ts";
import type { WorkerMessage } from "../ts-common/types.ts";

export default function postMessageToMain(
  msg: WorkerMessage,
  transferables?: Transferable[],
) {
  logger.debug("<-- sending to main:", msg.type);
  if (transferables === undefined) {
    postMessage(msg);
  } else {
    postMessage(msg, transferables);
  }
}
