import sleep from "./sleep.js";

const PRE_GC_SETTLE_MS = 1500;
const BETWEEN_SAMPLES_MS = 250;
const SAMPLE_COUNT = 3;

export async function assertMemoryApisAvailable(workerTelemetry) {
  if (window.gc == null) {
    throw new Error("Required GC API not available for memory tests.");
  }
  if (
    typeof window.performance?.measureUserAgentSpecificMemory !== "function" &&
    window.performance?.memory == null
  ) {
    throw new Error("Required browser memory measurement API not available.");
  }
  if (workerTelemetry == null) {
    throw new Error("Worker telemetry is required for memory tests.");
  }
}

export async function takeMemoryMeasurement(workerTelemetry) {
  await assertMemoryApisAvailable(workerTelemetry);
  window.gc();
  await sleep(PRE_GC_SETTLE_MS);

  /** @type {Array<MemoryMeasurement>} */
  const samples = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    window.gc();
    await sleep(BETWEEN_SAMPLES_MS);
    const [pageMemory, workerSnapshot] = await Promise.all([
      getPageMemoryMeasurement(),
      workerTelemetry.requestMemorySnapshot(),
    ]);
    samples.push(formatMeasurement(pageMemory, workerSnapshot));
  }
  samples.sort((a, b) => a.totalMemoryBytes - b.totalMemoryBytes);
  return samples[Math.floor(samples.length / 2)];
}

/**
 * @typedef {Object} MemoryMeasurement
 * @property {number} totalMemoryBytes
 * @property {number|null} pageUserAgentSpecificBytes
 * @property {number|null} pageJsHeapUsedBytes
 * @property {number|null} workerWasmMemoryBytes
 * @property {number|null} breakdownEntryCount
 * @property {"user-agent-specific"|"performance-memory"} measurementSource
 */

/**
 * @param {{
 *   bytes: number;
 *   usedJSHeapSize?: number | null;
 *   breakdown?: Array<unknown>;
 *   source: "user-agent-specific" | "performance-memory";
 * }} pageMemory
 * @param {{
 *   jsHeapUsedBytes?: number | null;
 *   wasmMemoryBytes?: number | null;
 *   userAgentSpecificBytes?: number | null;
 * }} workerSnapshot
 * @returns {MemoryMeasurement}
 */
function formatMeasurement(pageMemory, workerSnapshot) {
  const pageUserAgentSpecificBytes =
    pageMemory.source === "user-agent-specific" ? pageMemory.bytes : null;
  const pageJsHeapUsedBytes =
    pageMemory.usedJSHeapSize ??
    (pageMemory.source === "performance-memory" ? pageMemory.bytes : null);
  const workerUserAgentSpecificBytes =
    workerSnapshot.userAgentSpecificBytes ?? null;
  const workerJsHeapUsedBytes = workerSnapshot.jsHeapUsedBytes ?? null;
  const workerWasmMemoryBytes = workerSnapshot.wasmMemoryBytes ?? null;
  const breakdownEntryCount = Array.isArray(pageMemory.breakdown)
    ? pageMemory.breakdown.length
    : null;
  const workerTrackedBytes =
    workerUserAgentSpecificBytes ??
    (workerJsHeapUsedBytes ?? 0) + (workerWasmMemoryBytes ?? 0);
  const totalMemoryBytes =
    pageMemory.source === "user-agent-specific"
      ? pageMemory.bytes
      : pageMemory.bytes + workerTrackedBytes;

  return {
    totalMemoryBytes,
    pageUserAgentSpecificBytes,
    pageJsHeapUsedBytes,
    workerWasmMemoryBytes,
    breakdownEntryCount,
    measurementSource: pageMemory.source,
  };
}

async function getPageMemoryMeasurement() {
  if (
    typeof window.performance?.measureUserAgentSpecificMemory === "function"
  ) {
    try {
      const measurement =
        await window.performance.measureUserAgentSpecificMemory();
      return {
        bytes: measurement.bytes,
        breakdown: measurement.breakdown,
        source: "user-agent-specific",
      };
    } catch (_) {}
  }

  const perfMemory = window.performance?.memory;
  if (perfMemory != null) {
    return {
      bytes: perfMemory.usedJSHeapSize,
      usedJSHeapSize: perfMemory.usedJSHeapSize,
      source: "performance-memory",
    };
  }

  throw new Error("No usable browser memory measurement API available.");
}
