import WaspInitializationError from "./WaspInitializationError.ts";
import WaspMediaPlaylistParsingError from "./WaspMediaPlaylistParsingError.ts";
import WaspMediaPlaylistRequestError from "./WaspMediaPlaylistRequestError.ts";
import WaspMultivariantPlaylistParsingError from "./WaspMultivariantPlaylistParsingError.ts";
import WaspMultivariantPlaylistRequestError from "./WaspMultivariantPlaylistRequestError.ts";
import WaspOtherError from "./WaspOtherError.ts";
import WaspSegmentParsingError from "./WaspSegmentParsingError.ts";
import WaspSegmentRequestError from "./WaspSegmentRequestError.ts";
import WaspSourceBufferCreationError from "./WaspSourceBufferCreationError.ts";
import WaspSourceBufferError from "./WaspSourceBufferError.ts";

/**
 * General type for all potential errors returned by the `WaspHlsPlayer`.
 */
export type WaspError =
  | WaspMediaPlaylistParsingError
  | WaspMediaPlaylistRequestError
  | WaspMultivariantPlaylistParsingError
  | WaspMultivariantPlaylistRequestError
  | WaspOtherError
  | WaspSegmentParsingError
  | WaspSegmentRequestError
  | WaspSourceBufferCreationError
  | WaspSourceBufferError;

export { WaspErrorCode } from "./common.ts";

export {
  WaspInitializationError,
  WaspMediaPlaylistParsingError,
  WaspMediaPlaylistRequestError,
  WaspMultivariantPlaylistParsingError,
  WaspMultivariantPlaylistRequestError,
  WaspOtherError,
  WaspSegmentParsingError,
  WaspSegmentRequestError,
  WaspSourceBufferCreationError,
  WaspSourceBufferError,
};
