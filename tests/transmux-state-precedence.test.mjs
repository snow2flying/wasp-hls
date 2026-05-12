import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const VIDEO_TIMESCALE = 90_000;

async function bundleTransmuxSource(tmpRoot) {
  const outfile = join(tmpRoot, "transmux-test-bundle.mjs");
  await build({
    entryPoints: [join(process.cwd(), "tests/helpers/transmux-test-entry.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile,
    logLevel: "silent",
  });
  return import(pathToFileURL(outfile).href);
}

test("transmuxer prefers stored timeline state over a new decode-time hint", async () => {
  const tmpRoot = await mkdtemp(join(tmpdir(), "wasp-hls-transmux-state-"));
  try {
    const mod = await bundleTransmuxSource(tmpRoot);
    const transmuxer = new mod.default();

    transmuxer._videoTrack = {
      timelineStartInfo: {
        baseMediaDecodeTime: 12_345,
      },
    };

    transmuxer._prepareSegmentTimeline({
      value: 98_765,
      timescale: 1,
    });

    assert.equal(
      transmuxer._getCurrentBaseMediaDecodeTime(),
      12_345,
      "expected the transmuxer to keep using its stored timeline anchor when one is available",
    );
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test("transmuxer falls back to the decode-time hint when no state is stored", async () => {
  const tmpRoot = await mkdtemp(join(tmpdir(), "wasp-hls-transmux-state-"));
  try {
    const mod = await bundleTransmuxSource(tmpRoot);
    const transmuxer = new mod.default();

    transmuxer._prepareSegmentTimeline({
      value: 54_321,
      timescale: 1,
    });

    assert.equal(
      transmuxer._getCurrentBaseMediaDecodeTime(),
      54_321 * VIDEO_TIMESCALE,
      "expected the transmuxer to seed its timeline anchor from the hint when no stored state exists",
    );
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test("transmuxer does not treat an unset track anchor as stored state", async () => {
  const tmpRoot = await mkdtemp(join(tmpdir(), "wasp-hls-transmux-state-"));
  try {
    const mod = await bundleTransmuxSource(tmpRoot);
    const transmuxer = new mod.default();

    transmuxer._videoTrack = {
      timelineStartInfo: {},
    };

    transmuxer._prepareSegmentTimeline({
      value: 54_321,
      timescale: 1,
    });

    assert.equal(
      transmuxer._getCurrentBaseMediaDecodeTime(),
      54_321 * VIDEO_TIMESCALE,
      "expected an unset track anchor to fall back to the pending decode-time hint",
    );
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
