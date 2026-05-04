/**
 * Creates an ID generator which generates a different string identifier each
 * time you call it.
 * @returns {Function}
 */
export default function idGenerator(): () => string;
/**
 * Number-based version of `numberIdGenerator`.
 * @returns {Function}
 */
export declare function numberIdGenerator(): () => number;
