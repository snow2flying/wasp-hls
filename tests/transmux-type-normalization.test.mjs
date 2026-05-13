import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

async function bundleTransmuxTypeHelpers(tmpRoot) {
  const outfile = join(tmpRoot, "transmux-type-test-bundle.mjs");
  await build({
    entryPoints: [
      join(process.cwd(), "tests/helpers/transmux-type-test-entry.ts"),
    ],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile,
    logLevel: "silent",
  });
  return import(pathToFileURL(outfile).href);
}

test("transmuxed MIME keeps container and normalizes legacy AVC1 codec strings", async () => {
  const tmpRoot = await mkdtemp(join(tmpdir(), "wasp-hls-transmux-type-"));
  try {
    const mod = await bundleTransmuxTypeHelpers(tmpRoot);
    assert.equal(
      mod.getTransmuxedType(
        'video/mp2t;codecs="avc1.66.30,mp4a.40.2"',
        mod.MediaType.Video,
      ),
      'video/mp4;codecs="avc1.42001e,mp4a.40.2"',
    );
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test("support probing uses normalized post-transmux fMP4 MIME types", async () => {
  const tmpRoot = await mkdtemp(join(tmpdir(), "wasp-hls-transmux-type-"));
  try {
    const mod = await bundleTransmuxTypeHelpers(tmpRoot);
    assert.equal(
      mod.getFmp4Type(mod.MediaType.Video, "avc1.66.30"),
      'video/mp4;codecs="avc1.42001e"',
    );
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
