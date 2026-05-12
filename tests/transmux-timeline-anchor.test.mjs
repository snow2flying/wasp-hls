import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

async function readSegmentStarts(tmpRoot) {
  const playlist = await readFile(join(tmpRoot, "out.m3u8"), "utf8");
  const starts = new Map();
  let currentStart = 0;
  let currentDuration = 0;
  for (const line of playlist.split("\n")) {
    if (line.startsWith("#EXTINF:")) {
      currentDuration = Number(line.slice("#EXTINF:".length).split(",")[0]);
    } else if (line.endsWith(".ts")) {
      starts.set(line.trim(), {
        start: currentStart,
        duration: currentDuration,
      });
      currentStart += currentDuration;
    }
  }
  return starts;
}

function generateFixture(tmpRoot) {
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=320x180:rate=24",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "35",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-g",
      "48",
      "-keyint_min",
      "48",
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
      "10",
      "-hls_segment_type",
      "mpegts",
      "-hls_list_size",
      "0",
      "-hls_segment_filename",
      join(tmpRoot, "seg%03d.ts"),
      join(tmpRoot, "out.m3u8"),
    ],
    { stdio: "ignore" },
  );
}

async function transmuxSequence(mod, segments) {
  const transmuxer = new mod.default();
  let lastTimescale;
  const values = [];
  for (const { data, start, duration } of segments) {
    const out = transmuxer.transmuxSegment(data, {
      baseMediaDecodeTime: {
        value: Math.round(start * 90000),
        timescale: 90000,
      },
    });
    assert.ok(out?.data instanceof Uint8Array, "expected transmuxed data");
    lastTimescale = mod.getMDHDTimescale(out.data) ?? lastTimescale;
    assert.equal(typeof lastTimescale, "number", "expected a parsed timescale");
    const tfdt = mod.getTrackFragmentDecodeTime(out.data);
    assert.equal(typeof tfdt, "number", "expected a parsed tfdt");
    values.push(tfdt / lastTimescale);
  }
  return values;
}

if (!hasFfmpeg()) {
  test(
    "transmux timeline anchor regression requires ffmpeg",
    { skip: true },
    () => {},
  );
} else {
  test("TS transmux continuity prefers stored state over playlist decode-time hints", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "wasp-hls-transmux-test-"));
    try {
      const mod = await bundleTransmuxSource(tmpRoot);
      generateFixture(tmpRoot);
      const segmentStarts = await readSegmentStarts(tmpRoot);

      const earlyName = "seg000.ts";
      const lateName = "seg002.ts";
      const earlySegment = {
        data: new Uint8Array(await readFile(join(tmpRoot, earlyName))),
        ...segmentStarts.get(earlyName),
      };
      const lateSegment = {
        data: new Uint8Array(await readFile(join(tmpRoot, lateName))),
        ...segmentStarts.get(lateName),
      };
      assert.equal(typeof earlySegment.start, "number");
      assert.equal(typeof lateSegment.start, "number");

      const [earlyThenLateEarly, earlyThenLateLate] = await transmuxSequence(
        mod,
        [earlySegment, lateSegment],
      );
      const [lateThenEarlyLate, lateThenEarlyEarly] = await transmuxSequence(
        mod,
        [lateSegment, earlySegment],
      );

      assert.ok(
        earlyThenLateEarly < 0.1,
        "expected the first appended segment to seed the decode timeline near zero",
      );
      assert.ok(
        lateThenEarlyLate < 0.1,
        "expected a first appended late segment to follow the transmuxer's fresh state instead of its playlist hint",
      );
      assert.ok(
        earlyThenLateLate > 5,
        "expected a later segment appended after established continuity to stay meaningfully later in the decode timeline",
      );
      assert.ok(
        lateThenEarlyEarly < 0.1,
        "expected a back-seek segment to rejoin the existing transmux timeline instead of being repositioned by its playlist hint",
      );
      assert.ok(
        Math.abs(earlyThenLateLate - lateThenEarlyLate) > 5,
        "expected the same playlist segment to land at different decode times when transmux continuity state differs",
      );
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
}
