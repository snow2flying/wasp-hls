import EventEmitter from "./EventEmitter.ts";
/**
 * Possible verbosity level for the `WaspHlsPlayer`'s Logger.
 * A lower numberical value means less verbose.
 */
export declare const enum LoggerLevel {
  None = 0,
  Error = 1,
  Warning = 2,
  Info = 3,
  Debug = 4,
}
/**
 * Define the `Logger`'s console functions.
 * We're here restricting the types that can be logged to limit memory usage
 * when an inspector is displayed on a tested page.
 */
type ConsoleFunction = (
  ...args: Array<boolean | string | number | Error | null | undefined>
) => void;
/**
 * Events sent by `Logger` where the keys are the events' name and the values
 * are the corresponding payloads.
 */
interface LoggerEvents {
  onLogLevelChange: LoggerLevel;
}
/**
 * Logger implementation.
 * @class Logger
 */
export declare class Logger extends EventEmitter<LoggerEvents> {
  error: ConsoleFunction;
  warn: ConsoleFunction;
  info: ConsoleFunction;
  debug: ConsoleFunction;
  private _currentLevel;
  /**
   * Create a whole new `Logger`, independent of other `Logger`.
   */
  constructor();
  /**
   * Update the `Logger`'s verbosity level to the given one.
   * @param {number} level
   */
  setLevel(level: LoggerLevel): void;
  /**
   * Returns the `Logger`'s current verbosity level.
   * @returns {number}
   */
  getLevel(): LoggerLevel;
  /**
   * Returns `true` if the currently set level includes logs of the level given
   * in argument.
   * @param {number} logLevel
   * @returns {boolean}
   */
  hasLevel(logLevel: LoggerLevel): boolean;
}
declare const logger: Logger;
export default logger;
