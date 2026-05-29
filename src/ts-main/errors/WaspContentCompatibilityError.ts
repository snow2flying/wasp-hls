import { ContentCompatibilityErrorCode } from "../../wasm/index.js";
import { WaspErrorCode } from "./common.ts";

/**
 * Error used when the content is incompatible with the current environment.
 * @class WaspContentCompatibilityError
 */
export default class WaspContentCompatibilityError extends Error {
  /** Identifies a `WaspContentCompatibilityError` */
  public readonly name: "WaspContentCompatibilityError";

  /** Human-readable message describing the error. */
  public readonly message: string;

  /** Specifies the exact error encountered. */
  public readonly code: "NoSupportedVariant";

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
   * @param {number} reason
   * @param {string} message
   */
  constructor(
    reason: ContentCompatibilityErrorCode,
    message?: string | undefined,
  ) {
    super();
    // @see https://stackoverflow.com/questions/41102060/typescript-extending-error-class
    Object.setPrototypeOf(this, WaspContentCompatibilityError.prototype);

    this.name = "WaspContentCompatibilityError";
    switch (reason) {
      case ContentCompatibilityErrorCode.NoSupportedVariant:
      default:
        this.code = WaspErrorCode.NoSupportedVariant;
        break;
    }
    this.globalCode = this.code;
    this.message = message ?? "The current content is not compatible";
  }
}
