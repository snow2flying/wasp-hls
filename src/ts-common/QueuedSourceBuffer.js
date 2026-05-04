import assertNever from "./assertNever.js";
import logger from "./logger.js";
/**
 * Error raised for queued SourceBuffer operations that were never attempted
 * because a previous SourceBuffer operation already failed.
 */
export class SourceBufferOperationCancelledError extends Error {
  constructor() {
    super(
      "Queued SourceBuffer operation cancelled because a previous operation failed",
    );
    this.name = "SourceBufferOperationCancelledError";
  }
}
/** List the "operations" a `QueuedSourceBuffer` might perform. */
export var SourceBufferOperation;
(function (SourceBufferOperation) {
  /** Pushing new data to the `SourceBuffer`. */
  SourceBufferOperation[(SourceBufferOperation["Push"] = 0)] = "Push";
  /** Removing data from the `SourceBuffer`. */
  SourceBufferOperation[(SourceBufferOperation["Remove"] = 1)] = "Remove";
})(SourceBufferOperation || (SourceBufferOperation = {}));
/**
 * Allows to push and remove new Segments to a SourceBuffer in a FIFO queue (not
 * doing so can lead to browser Errors) as well as being Promise-based, instead
 * of event-based.
 *
 * NOTE: is this complexity really needed here? Event-based actually seems more
 * logical, as main-worker messages are also event-based as of now.
 * Time will tell...
 *
 * To work correctly, only a single QueuedSourceBuffer per SourceBuffer should
 * be created.
 *
 * @class QueuedSourceBuffer
 */
export default class QueuedSourceBuffer {
  /**
   * Create a new `QueuedSourceBuffer` associated to the given `SourceBuffer`.
   *
   * Only one `QueuedSourceBuffer` should be created per `SourceBuffer` to avoid
   * issues.
   *
   * @constructor
   * @param {SourceBuffer} sourceBuffer
   */
  constructor(sourceBuffer) {
    this._sourceBuffer = sourceBuffer;
    this._queue = [];
    this._pendingTask = null;
    // Some browsers (happened with firefox 66) sometimes "forget" to send us
    // `update` or `updateend` events.
    // In that case, we're completely unable to continue the queue here and
    // stay locked in a waiting state.
    // This interval is here to check at regular intervals if the underlying
    // SourceBuffer is currently updating.
    const intervalId = setInterval(() => {
      this._flush();
    }, 2000);
    const onError = this._onPendingTaskError.bind(this);
    const _onUpdateEnd = () => {
      this._flush();
    };
    sourceBuffer.addEventListener("error", onError);
    sourceBuffer.addEventListener("updateend", _onUpdateEnd);
    this._dispose = [
      () => {
        clearInterval(intervalId);
        sourceBuffer.removeEventListener("error", onError);
        sourceBuffer.removeEventListener("updateend", _onUpdateEnd);
      },
    ];
  }
  /**
   * Push a chunk of the media segment given to the attached SourceBuffer, in a
   * FIFO queue.
   *
   * Depending on the type of data appended, this might need an associated
   * initialization segment.
   *
   * @param {BufferSource} data
   * @returns {Promise}
   */
  push(data) {
    logger.debug("QSB: receiving order to push data to the SourceBuffer");
    return this._addToQueue({ type: SourceBufferOperation.Push, value: data });
  }
  /**
   * Remove buffered data (added to the same FIFO queue than `push`).
   * @param {number} start - start position, in seconds
   * @param {number} end - end position, in seconds
   * @returns {Promise}
   */
  removeBuffer(start, end) {
    logger.debug(
      "QSB: receiving order to remove data from the SourceBuffer",
      start,
      end,
    );
    return this._addToQueue({
      type: SourceBufferOperation.Remove,
      value: { start, end },
    });
  }
  /**
   * Returns the currently buffered data, in a TimeRanges object.
   * @returns {TimeRanges}
   */
  getBufferedRanges() {
    return this._sourceBuffer.buffered;
  }
  /**
   * Dispose of the resources used by this QueuedSourceBuffer.
   *
   * /!\ You won't be able to use the QueuedSourceBuffer after calling this
   * function.
   * @private
   */
  dispose() {
    this._dispose.forEach((disposeFn) => disposeFn());
    if (this._pendingTask !== null) {
      this._pendingTask.reject(new Error("QueuedSourceBuffer Cancelled"));
      this._pendingTask = null;
    }
    while (this._queue.length > 0) {
      const nextElement = this._queue.shift();
      if (nextElement !== undefined) {
        nextElement.reject(new Error("QueuedSourceBuffer Cancelled"));
      }
    }
    // try {
    //   this._sourceBuffer.abort();
    // } catch (e) {
    //   logger.warn(
    //     `QSB: Failed to abort a SourceBuffer:`,
    //     e instanceof Error ? e : "Unknown error"
    //   );
    // }
  }
  /**
   * Called when an error arised that made the current task fail.
   * @private
   * @param {*} err
   */
  _onPendingTaskError(err) {
    const error =
      err instanceof Error
        ? err
        : new Error(
            "An unknown error occured when doing operations " +
              "on the SourceBuffer",
          );
    if (this._pendingTask !== null) {
      this._pendingTask.reject(error);
    }
    this._pendingTask = null;
    const cancellationError = new SourceBufferOperationCancelledError();
    while (this._queue.length > 0) {
      const nextElement = this._queue.shift();
      nextElement === null || nextElement === void 0
        ? void 0
        : nextElement.reject(cancellationError);
    }
  }
  /**
   * Add your operation to the queue. and begin the queue if not already
   * started.
   * @private
   * @param {Object} operation
   * @returns {Promise}
   */
  _addToQueue(operation) {
    return new Promise((resolve, reject) => {
      const shouldRestartQueue =
        this._queue.length === 0 && this._pendingTask === null;
      const queueItem = Object.assign({ resolve, reject }, operation);
      this._queue.push(queueItem);
      if (shouldRestartQueue) {
        this._flush();
      }
    });
  }
  /**
   * Perform next task if one.
   * @private
   */
  _flush() {
    if (this._sourceBuffer.updating) {
      return; // still processing `this._pendingTask`
    }
    if (this._pendingTask !== null) {
      const task = this._pendingTask;
      const { resolve } = task;
      this._pendingTask = null;
      resolve();
      return this._flush(); // Go to next item in queue
    } else {
      // if this._pendingTask is null, go to next item in queue
      const nextItem = this._queue.shift();
      if (nextItem === undefined) {
        return; // we have nothing left to do
      } else {
        this._pendingTask = nextItem;
      }
    }
    try {
      switch (this._pendingTask.type) {
        case SourceBufferOperation.Push:
          const segmentData = this._pendingTask.value;
          if (segmentData === undefined) {
            this._flush();
            return;
          }
          logger.debug("QSB: pushing data");
          this._sourceBuffer.appendBuffer(segmentData);
          break;
        case SourceBufferOperation.Remove:
          const { start, end } = this._pendingTask.value;
          logger.debug("QSB: removing data from SourceBuffer", start, end);
          this._sourceBuffer.remove(start, end);
          break;
        default:
          assertNever(this._pendingTask);
      }
    } catch (e) {
      this._onPendingTaskError(e);
    }
  }
}
