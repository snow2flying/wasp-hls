/**
 * Return a monotonic timestamp in milliseconds when available.
 *
 * Falls back to `Date.now` in environments where `performance.now` is not
 * exposed. e.g. Some environments (such as Safari Desktop) weirdly do not
 * support `performance.now` inside a WebWorker.
 * @returns {number}
 */
export default function monotonicNow(): number {
  return typeof performance === "object" &&
    performance !== null &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
