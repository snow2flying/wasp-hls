import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

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

function generateFixture(tmpRoot, name, videoSource) {
  const dir = join(tmpRoot, name);
  mkdirSync(dir, { recursive: true });
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      videoSource,
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "8",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-g",
      "96",
      "-keyint_min",
      "96",
      "-sc_threshold",
      "0",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-f",
      "hls",
      "-hls_time",
      "2",
      "-hls_flags",
      "split_by_time",
      "-hls_segment_type",
      "mpegts",
      "-hls_list_size",
      "0",
      "-hls_segment_filename",
      join(dir, "seg%03d.ts"),
      join(dir, "out.m3u8"),
    ],
    { stdio: "ignore" },
  );
  return dir;
}

function areByteArraysEqual(a, b) {
  return (
    a instanceof Uint8Array &&
    b instanceof Uint8Array &&
    a.byteLength === b.byteLength &&
    Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0
  );
}

if (!hasFfmpeg()) {
  test(
    "transmux discontinuity reset regression requires ffmpeg",
    { skip: true },
    () => {},
  );
} else {
  test("transmux reseeds state across an explicit discontinuity", async () => {
    const tmpRoot = await mkdtemp(
      join(tmpdir(), "wasp-hls-transmux-discontinuity-"),
    );
    try {
      const mod = await bundleTransmuxSource(tmpRoot);
      await mkdir(join(tmpRoot, "fixtures"), { recursive: true });
      const fixtureA = generateFixture(
        join(tmpRoot, "fixtures"),
        "stream-a",
        "testsrc=size=320x180:rate=24",
      );
      const fixtureB = generateFixture(
        join(tmpRoot, "fixtures"),
        "stream-b",
        "smptebars=size=320x180:rate=24",
      );

      const segmentFromA = new Uint8Array(
        await readFile(join(fixtureA, "seg000.ts")),
      );
      const midGopSegmentFromB = new Uint8Array(
        await readFile(join(fixtureB, "seg001.ts")),
      );

      const withoutReset = new mod.default();
      withoutReset.transmuxSegment(segmentFromA, {
        continuity: {
          start: 0,
          duration: 2,
          contiguous: false,
          resetReason: "none",
        },
      });
      const leakedAcrossDiscontinuity = withoutReset.transmuxSegment(
        midGopSegmentFromB,
        {
          continuity: {
            start: 2,
            duration: 2,
            contiguous: false,
            resetReason: "playlist-discontinuity",
          },
        },
      );

      const fresh = new mod.default();
      const expectedAfterReset = fresh.transmuxSegment(midGopSegmentFromB, {
        continuity: {
          start: 2,
          duration: 2,
          contiguous: false,
          resetReason: "none",
        },
      });

      assert.ok(
        leakedAcrossDiscontinuity instanceof Uint8Array &&
          expectedAfterReset instanceof Uint8Array,
        "expected both transmux operations to produce output",
      );
      assert.ok(
        areByteArraysEqual(leakedAcrossDiscontinuity, expectedAfterReset),
        "expected a discontinuity boundary to reseed transmux state instead of reusing cached GOP data from the previous stream",
      );
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
}
