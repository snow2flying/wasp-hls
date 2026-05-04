export declare const PlaylistType: Readonly<{
  readonly MultivariantPlaylist: 0;
  readonly MediaPlaylist: 1;
}>;
export type PlaylistType = (typeof PlaylistType)[keyof typeof PlaylistType];
export declare const OtherErrorCode: Readonly<{
  readonly NoSupportedVariant: 0;
  readonly UnfoundLockedVariant: 1;
  readonly MediaSourceAttachmentError: 2;
  readonly Unknown: 3;
}>;
export type OtherErrorCode =
  (typeof OtherErrorCode)[keyof typeof OtherErrorCode];
export declare const SourceBufferCreationErrorCode: Readonly<{
  readonly AlreadyCreatedWithSameType: 0;
  readonly CantPlayType: 1;
  readonly EmptyMimeType: 2;
  readonly MediaSourceIsClosed: 3;
  readonly NoMediaSourceAttached: 4;
  readonly QuotaExceededError: 5;
  readonly Unknown: 6;
}>;
export type SourceBufferCreationErrorCode =
  (typeof SourceBufferCreationErrorCode)[keyof typeof SourceBufferCreationErrorCode];
export declare const RequestErrorReason: Readonly<{
  readonly Timeout: 0;
  readonly Status: 1;
  readonly Error: 2;
  readonly Other: 3;
}>;
export type RequestErrorReason =
  (typeof RequestErrorReason)[keyof typeof RequestErrorReason];
export declare const RemoveMediaSourceErrorCode: Readonly<{
  readonly NoMediaSourceAttached: 0;
  readonly UnknownError: 1;
}>;
export type RemoveMediaSourceErrorCode =
  (typeof RemoveMediaSourceErrorCode)[keyof typeof RemoveMediaSourceErrorCode];
export declare const MediaSourceDurationUpdateErrorCode: Readonly<{
  readonly NoMediaSourceAttached: 0;
  readonly UnknownError: 1;
}>;
export type MediaSourceDurationUpdateErrorCode =
  (typeof MediaSourceDurationUpdateErrorCode)[keyof typeof MediaSourceDurationUpdateErrorCode];
export declare const AttachMediaSourceErrorCode: Readonly<{
  readonly UnknownError: 0;
  readonly NoContentLoaded: 1;
}>;
export type AttachMediaSourceErrorCode =
  (typeof AttachMediaSourceErrorCode)[keyof typeof AttachMediaSourceErrorCode];
export declare const RemoveBufferErrorCode: Readonly<{
  readonly SourceBufferNotFound: 0;
  readonly UnknownError: 1;
}>;
export type RemoveBufferErrorCode =
  (typeof RemoveBufferErrorCode)[keyof typeof RemoveBufferErrorCode];
export declare const EndOfStreamErrorCode: Readonly<{
  readonly NoMediaSourceAttached: 0;
  readonly UnknownError: 1;
}>;
export type EndOfStreamErrorCode =
  (typeof EndOfStreamErrorCode)[keyof typeof EndOfStreamErrorCode];
export declare const MultivariantPlaylistParsingErrorCode: Readonly<{
  readonly MissingExtM3uHeader: 0;
  readonly MultivariantPlaylistWithoutVariant: 1;
  readonly MissingUriLineAfterVariant: 2;
  readonly UnableToReadVariantUri: 3;
  readonly VariantMissingBandwidth: 4;
  readonly InvalidValue: 5;
  readonly MediaTagMissingType: 6;
  readonly MediaTagMissingName: 7;
  readonly MediaTagMissingGroupId: 8;
  readonly UnableToReadLine: 9;
  readonly Unknown: 10;
}>;
export type MultivariantPlaylistParsingErrorCode =
  (typeof MultivariantPlaylistParsingErrorCode)[keyof typeof MultivariantPlaylistParsingErrorCode];
export declare const MediaPlaylistParsingErrorCode: Readonly<{
  readonly UnparsableExtInf: 0;
  readonly UriMissingInMap: 1;
  readonly MissingTargetDuration: 2;
  readonly UriWithoutExtInf: 3;
  readonly UnparsableByteRange: 4;
  readonly Unknown: 5;
}>;
export type MediaPlaylistParsingErrorCode =
  (typeof MediaPlaylistParsingErrorCode)[keyof typeof MediaPlaylistParsingErrorCode];
export declare const AddSourceBufferErrorCode: Readonly<{
  readonly NoMediaSourceAttached: 0;
  readonly MediaSourceIsClosed: 1;
  readonly QuotaExceededError: 2;
  readonly TypeNotSupportedError: 3;
  readonly EmptyMimeType: 4;
  readonly UnknownError: 5;
}>;
export type AddSourceBufferErrorCode =
  (typeof AddSourceBufferErrorCode)[keyof typeof AddSourceBufferErrorCode];
export declare const SegmentParsingErrorCode: Readonly<{
  readonly NoResource: 0;
  readonly NoSourceBuffer: 1;
  readonly TransmuxerError: 2;
  readonly UnknownError: 3;
}>;
export type SegmentParsingErrorCode =
  (typeof SegmentParsingErrorCode)[keyof typeof SegmentParsingErrorCode];
export declare const PushedSegmentErrorCode: Readonly<{
  readonly BufferFull: 0;
  readonly UnknownError: 1;
}>;
export type PushedSegmentErrorCode =
  (typeof PushedSegmentErrorCode)[keyof typeof PushedSegmentErrorCode];
export declare const PlaybackObservationReason: Readonly<{
  readonly Init: 0;
  readonly Seeked: 1;
  readonly Seeking: 2;
  readonly Ended: 3;
  readonly ReadyStateChanged: 4;
  readonly RegularInterval: 5;
  readonly Error: 6;
}>;
export type PlaybackObservationReason =
  (typeof PlaybackObservationReason)[keyof typeof PlaybackObservationReason];
export declare const TimerReason: Readonly<{
  readonly MediaPlaylistRefresh: 0;
  readonly RetryRequest: 1;
}>;
export type TimerReason = (typeof TimerReason)[keyof typeof TimerReason];
export declare const LogLevel: Readonly<{
  readonly Error: 0;
  readonly Warn: 1;
  readonly Info: 2;
  readonly Debug: 3;
}>;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];
export declare const MediaType: Readonly<{
  readonly Audio: 0;
  readonly Video: 1;
}>;
export type MediaType = (typeof MediaType)[keyof typeof MediaType];
export declare const PlaylistNature: Readonly<{
  readonly Event: 0;
  readonly VoD: 1;
  readonly Live: 2;
  readonly Unknown: 3;
}>;
export type PlaylistNature =
  (typeof PlaylistNature)[keyof typeof PlaylistNature];
export declare const MediaSourceReadyState: Readonly<{
  readonly Closed: 0;
  readonly Ended: 1;
  readonly Open: 2;
}>;
export type MediaSourceReadyState =
  (typeof MediaSourceReadyState)[keyof typeof MediaSourceReadyState];
export declare const StartingPositionType: Readonly<{
  readonly Absolute: 0;
  readonly FromBeginning: 1;
  readonly FromEnd: 2;
}>;
export type StartingPositionType =
  (typeof StartingPositionType)[keyof typeof StartingPositionType];
export declare const PlaybackTickReason: Readonly<{
  readonly Init: 0;
  readonly RegularInterval: 1;
  readonly Seeking: 2;
  readonly Seeked: 3;
  readonly LoadedData: 4;
  readonly LoadedMetadata: 5;
  readonly CanPlay: 6;
  readonly CanPlayThrough: 7;
  readonly Ended: 8;
  readonly Pause: 9;
  readonly Play: 10;
  readonly RateChange: 11;
  readonly Stalled: 12;
}>;
export type PlaybackTickReason =
  (typeof PlaybackTickReason)[keyof typeof PlaybackTickReason];
