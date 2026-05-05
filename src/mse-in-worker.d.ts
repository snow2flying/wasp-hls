/**
 * Minimal MSE declarations used by the worker-side projects.
 *
 * We intentionally only declare the subset relied on by this codebase so we
 * can keep using the `WebWorker` lib without pulling the whole `dom` lib and
 * its conflicting globals into the worker compilation.
 */

interface MediaSourceHandle {}

interface TimeRanges {
  readonly length: number;
  end(index: number): number;
  start(index: number): number;
}

interface SourceBuffer extends EventTarget {
  readonly buffered: TimeRanges;
  readonly updating: boolean;
  abort(): void;
  appendBuffer(data: BufferSource): void;
  remove(start: number, end: number): void;
  addEventListener(
    type: "error" | "updateend",
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: "error" | "updateend",
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
}

interface MediaSource extends EventTarget {
  duration: number;
  readonly handle?: MediaSourceHandle;
  readonly readyState: "closed" | "ended" | "open";
  addSourceBuffer(type: string): SourceBuffer;
  endOfStream(error?: "decode" | "network"): void;
  removeSourceBuffer(sourceBuffer: SourceBuffer): void;
  addEventListener(
    type: "sourceclose" | "sourceended" | "sourceopen",
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: "sourceclose" | "sourceended" | "sourceopen",
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
}

declare var MediaSource: {
  prototype: MediaSource;
  new (): MediaSource;
  readonly canConstructInDedicatedWorker: boolean;
  isTypeSupported(type: string): boolean;
};
