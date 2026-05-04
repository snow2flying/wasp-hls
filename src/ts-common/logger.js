import EventEmitter from "./EventEmitter.js";
import noop from "./noop.js";
/** Logger level initially set on `Logger`. */
const DEFAULT_LOG_LEVEL = 0; /* LoggerLevel.None */
/**
 * Logger implementation.
 * @class Logger
 */
export class Logger extends EventEmitter {
  /**
   * Create a whole new `Logger`, independent of other `Logger`.
   */
  constructor() {
    super();
    this.error = noop;
    this.warn = noop;
    this.info = noop;
    this.debug = noop;
    this._currentLevel = DEFAULT_LOG_LEVEL;
  }
  /**
   * Update the `Logger`'s verbosity level to the given one.
   * @param {number} level
   */
  setLevel(level) {
    const actualLevel =
      level < 0 || level > 4 /* LoggerLevel.Debug */
        ? 0 /* LoggerLevel.None */
        : level;
    this._currentLevel = actualLevel;
    /* eslint-disable no-console */
    this.error =
      actualLevel >= 1 /* LoggerLevel.Error */
        ? console.error.bind(console)
        : noop;
    this.warn =
      actualLevel >= 2 /* LoggerLevel.Warning */
        ? console.warn.bind(console)
        : noop;
    this.info =
      actualLevel >= 3 /* LoggerLevel.Info */
        ? console.info.bind(console)
        : noop;
    this.debug =
      actualLevel >= 4 /* LoggerLevel.Debug */
        ? console.debug.bind(console)
        : noop;
    /* eslint-enable no-console */
    this.trigger("onLogLevelChange", actualLevel);
  }
  /**
   * Returns the `Logger`'s current verbosity level.
   * @returns {number}
   */
  getLevel() {
    return this._currentLevel;
  }
  /**
   * Returns `true` if the currently set level includes logs of the level given
   * in argument.
   * @param {number} logLevel
   * @returns {boolean}
   */
  hasLevel(logLevel) {
    return logLevel >= this._currentLevel;
  }
}
const logger = new Logger();
export default logger;
