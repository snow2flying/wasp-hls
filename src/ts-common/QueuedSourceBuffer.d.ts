/**
 * Error raised for queued SourceBuffer operations that were never attempted
 * because a previous SourceBuffer operation already failed.
 */
export declare class SourceBufferOperationCancelledError extends Error {
  constructor();
}
/** List the "operations" a `QueuedSourceBuffer` might perform. */
export declare enum SourceBufferOperation {
  /** Pushing new data to the `SourceBuffer`. */
  Push = 0,
  /** Removing data from the `SourceBuffer`. */
  Remove = 1,
}
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
  /** SourceBuffer implementation. */
  private readonly _sourceBuffer;
  /**
   * Queue of awaited buffer "operations".
   * The first element in this array will be the first performed.
   */
  private _queue;
  /**
   * Information about the current operation processed by the
   * QueuedSourceBuffer.
   * If equal to null, it means that no operation from the queue is currently
   * being processed.
   */
  private _pendingTask;
  /**
   * Callbacks to call when disposing the `QueuedSourceBuffer` to free
   * resources.
   */
  private _dispose;
  /**
   * Create a new `QueuedSourceBuffer` associated to the given `SourceBuffer`.
   *
   * Only one `QueuedSourceBuffer` should be created per `SourceBuffer` to avoid
   * issues.
   *
   * @constructor
   * @param {SourceBuffer} sourceBuffer
   */
  constructor(sourceBuffer: SourceBuffer);
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
  push(data: BufferSource): Promise<void>;
  /**
   * Remove buffered data (added to the same FIFO queue than `push`).
   * @param {number} start - start position, in seconds
   * @param {number} end - end position, in seconds
   * @returns {Promise}
   */
  removeBuffer(start: number, end: number): Promise<void>;
  /**
   * Returns the currently buffered data, in a TimeRanges object.
   * @returns {TimeRanges}
   */
  getBufferedRanges(): TimeRanges;
  /**
   * Dispose of the resources used by this QueuedSourceBuffer.
   *
   * /!\ You won't be able to use the QueuedSourceBuffer after calling this
   * function.
   * @private
   */
  dispose(): void;
  /**
   * Called when an error arised that made the current task fail.
   * @private
   * @param {*} err
   */
  private _onPendingTaskError;
  /**
   * Add your operation to the queue. and begin the queue if not already
   * started.
   * @private
   * @param {Object} operation
   * @returns {Promise}
   */
  private _addToQueue;
  /**
   * Perform next task if one.
   * @private
   */
  private _flush;
}
