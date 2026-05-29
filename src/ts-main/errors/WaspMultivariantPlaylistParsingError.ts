import { MultivariantPlaylistParsingErrorCode } from "../../wasm/index.js";
import type { WaspErrorCode } from "./common.ts";

/**
 * Error used to describe a problem when parsing a Multivariant Playlist.
 * @class WaspMultivariantPlaylistParsingError
 */
export default class WaspMultivariantPlaylistParsingError extends Error {
  /** Identifies a `WaspMultivariantPlaylistParsingError` */
  public readonly name: "WaspMultivariantPlaylistParsingError";

  /** Human-readable message describing the error. */
  public readonly message: string;

  /** Specifies the exact error encountered. */
  public readonly code:
    | "MultivariantPlaylistMissingUriLineAfterVariant"
    | "MultivariantPlaylistWithoutVariant"
    | "MultivariantPlaylistVariantMissingBandwidth"
    | "MultivariantPlaylistInvalidValue"
    | "MultivariantPlaylistMissingRequiredAttribute"
    | "MultivariantPlaylistVariableDefinitionError"
    | "MultivariantPlaylistDuplicateTag"
    | "MultivariantPlaylistConflictingTagTypes"
    | "MultivariantPlaylistOtherParsingError";

  /**
   * Specifies the exact error encountered.
   *
   * This is actually the same value as `code` but with a type common to all
   * `WaspHlsPlayer` Errors. The goal is to simplify your code would you ever
   * want to use the code without having to first check the `name` property in
   * your TypeScript code.
   */
  public readonly globalCode: keyof typeof WaspErrorCode;

  /**
   * @param {number} code
   * @param {string} message
   */
  constructor(
    code: MultivariantPlaylistParsingErrorCode,
    message?: string | undefined,
  ) {
    super();
    // @see https://stackoverflow.com/questions/41102060/typescript-extending-error-class
    Object.setPrototypeOf(this, WaspMultivariantPlaylistParsingError.prototype);

    switch (code) {
      case MultivariantPlaylistParsingErrorCode.MultivariantPlaylistWithoutVariant:
        this.code = "MultivariantPlaylistWithoutVariant";
        break;
      case MultivariantPlaylistParsingErrorCode.MissingUriLineAfterVariant:
        this.code = "MultivariantPlaylistMissingUriLineAfterVariant";
        break;
      case MultivariantPlaylistParsingErrorCode.VariantMissingBandwidth:
        this.code = "MultivariantPlaylistVariantMissingBandwidth";
        break;
      case MultivariantPlaylistParsingErrorCode.InvalidValue:
        this.code = "MultivariantPlaylistInvalidValue";
        break;
      case MultivariantPlaylistParsingErrorCode.MissingRequiredAttribute:
        this.code = "MultivariantPlaylistMissingRequiredAttribute";
        break;
      case MultivariantPlaylistParsingErrorCode.VariableDefinitionError:
        this.code = "MultivariantPlaylistVariableDefinitionError";
        break;
      case MultivariantPlaylistParsingErrorCode.DuplicateTag:
        this.code = "MultivariantPlaylistDuplicateTag";
        break;
      case MultivariantPlaylistParsingErrorCode.ConflictingPlaylistTagTypes:
        this.code = "MultivariantPlaylistConflictingTagTypes";
        break;
      case MultivariantPlaylistParsingErrorCode.Unknown:
        this.code = "MultivariantPlaylistOtherParsingError";
        break;
      default:
        this.code = "MultivariantPlaylistOtherParsingError";
        break;
    }

    this.globalCode = this.code;

    this.name = "WaspMultivariantPlaylistParsingError";
    this.message =
      message ?? "Unknown error when parsing the Multivariant Playlist";
  }
}
