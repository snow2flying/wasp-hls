import { MediaSourceReadyState, PlaybackTickReason } from "../wasm/index.js";
export { MediaSourceReadyState, PlaybackTickReason };
/** Codes that should be sent alongside a `CreateSourceBufferErrorMainMessage`. */
export var SourceBufferCreationErrorCode;
(function (SourceBufferCreationErrorCode) {
  /**
   * The given `mediaSourceId` was right but there was no MediaSource on the
   * main thread.
   *
   * This looks like the MediaSource has been created on the worker but the
   * SourceBuffer is asked to be created on the main thread, which is an error.
   */
  SourceBufferCreationErrorCode[
    (SourceBufferCreationErrorCode["NoMediaSource"] = 0)
  ] = "NoMediaSource";
  /**
   * An error arised when creating the SourceBuffer through the MediaSource.
   */
  SourceBufferCreationErrorCode[
    (SourceBufferCreationErrorCode["AddSourceBufferError"] = 1)
  ] = "AddSourceBufferError";
})(SourceBufferCreationErrorCode || (SourceBufferCreationErrorCode = {}));
