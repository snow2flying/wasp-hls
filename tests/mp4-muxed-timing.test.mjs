import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

async function bundleWorkerMp4Utils(tmpRoot) {
  const outfile = join(tmpRoot, "mp4-utils-test-bundle.mjs");
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

function ascii4(name) {
  return Uint8Array.from(name.split("").map((char) => char.charCodeAt(0)));
}

function u32(value) {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function concat(...parts) {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function box(name, ...payload) {
  const content = concat(...payload);
  return concat(u32(content.byteLength + 8), ascii4(name), content);
}

function fullBox(name, version, flags, ...payload) {
  return box(
    name,
    Uint8Array.from([
      version,
      (flags >>> 16) & 0xff,
      (flags >>> 8) & 0xff,
      flags & 0xff,
    ]),
    ...payload,
  );
}

function makeTrak(trackId, timescale) {
  const tkhd = fullBox("tkhd", 0, 0, u32(0), u32(0), u32(trackId), u32(0));
  const mdhd = fullBox("mdhd", 0, 0, u32(0), u32(0), u32(timescale), u32(0));
  return box("trak", tkhd, box("mdia", mdhd));
}

function makeInitSegment() {
  return box("moov", makeTrak(1, 90000), makeTrak(2, 48000));
}

function makeTfhd(trackId) {
  return fullBox("tfhd", 0, 0, u32(trackId));
}

function makeTfdt(baseDecodeTime) {
  return fullBox("tfdt", 0, 0, u32(baseDecodeTime));
}

function makeTrun(sampleDurations) {
  return fullBox(
    "trun",
    0,
    0x000100,
    u32(sampleDurations.length),
    ...sampleDurations.map((duration) => u32(duration)),
  );
}

function makeMediaSegment() {
  const videoTraf = box(
    "traf",
    makeTfhd(1),
    makeTfdt(900000),
    makeTrun([3000, 3000]),
  );
  const audioTraf = box(
    "traf",
    makeTfhd(2),
    makeTfdt(480000),
    makeTrun([1024, 1024]),
    makeTrun([1024]),
  );
  return box("moof", videoTraf, audioTraf);
}

test("worker MP4 timing normalizes muxed tracks with distinct timescales", async () => {
  const tmpRoot = await mkdtemp(join(tmpdir(), "wasp-hls-mp4-utils-"));
  try {
    const mod = await bundleWorkerMp4Utils(tmpRoot);
    const initTimescales = mod.getMDHDTimescales(makeInitSegment());
    assert.ok(initTimescales instanceof Map, "expected init timescales map");

    const info = mod.getSegmentTimeInformation(
      makeMediaSegment(),
      initTimescales,
    );
    assert.ok(info, "expected normalized segment timing");
    assert.ok(Math.abs(info.time - 10) < 1e-6, "expected a 10s segment start");
    assert.ok(
      Math.abs(info.duration - 6000 / 90000) < 1e-6,
      "expected duration to span the longest normalized track run",
    );
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
