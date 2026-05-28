import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildPlaylistPublicationSnapshot,
  getPublisherStatusPath,
  startLiveOutputPublisher,
} from "../../scripts/packager/publisher.mjs";

/**
 * @param {string} rootDir
 * @param {string} relativePath
 * @param {string} content
 */
function writeTextFile(rootDir, relativePath, content) {
  mkdirSync(rootDir, { recursive: true });
  writeFileSync(join(rootDir, relativePath), content, "utf8");
}

/**
 * @param {string} rootDir
 * @param {string} relativePath
 * @param {Uint8Array | Buffer} content
 */
function writeBinaryFile(rootDir, relativePath, content) {
  mkdirSync(rootDir, { recursive: true });
  writeFileSync(join(rootDir, relativePath), content);
}

/**
 * @param {string} type
 * @param {Buffer} [payload]
 * @returns {Buffer}
 */
function makeBox(type, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, payload]);
}

/**
 * @param {string} payloadText
 * @returns {Buffer}
 */
function makeMediaSegment(payloadText) {
  const payload = Buffer.alloc(256, 0);
  payload.write(payloadText, 0, "utf8");
  const moof = makeBox(
    "moof",
    Buffer.concat([
      makeBox("mfhd", Buffer.alloc(4)),
      makeBox(
        "traf",
        Buffer.concat([
          makeBox("tfhd", Buffer.alloc(8)),
          makeBox("tfdt", Buffer.alloc(8)),
          makeBox("trun", Buffer.alloc(8)),
        ]),
      ),
    ]),
  );
  return Buffer.concat([
    makeBox("styp", Buffer.from("msdh")),
    moof,
    makeBox("mdat", payload),
  ]);
}

/**
 * @param {() => void} assertion
 * @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
async function waitFor(assertion, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      assertion();
      return;
    } catch (_err) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  assertion();
}

function buildMasterPlaylist() {
  return `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,AUTOSELECT=YES,URI="audio_eng.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="French",DEFAULT=NO,AUTOSELECT=YES,URI="audio_fra.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Armenian",DEFAULT=NO,AUTOSELECT=YES,URI="audio_arm.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2500000,CODECS="avc1.64001f,mp4a.40.2",AUDIO="audio"
h264_720p.m3u8
`;
}

/**
 * @param {string[]} segmentNames
 * @param {number} [mediaSequence]
 * @param {string | null} [initSegment]
 * @returns {string}
 */
function buildMediaPlaylist(
  segmentNames,
  mediaSequence = 0,
  initSegment = null,
) {
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    "#EXT-X-TARGETDURATION:2",
    `#EXT-X-MEDIA-SEQUENCE:${mediaSequence}`,
  ];
  if (initSegment !== null) {
    lines.push(`#EXT-X-MAP:URI="${initSegment}"`);
  }
  for (const segmentName of segmentNames) {
    lines.push("#EXTINF:2.0,");
    lines.push(segmentName);
  }
  return `${lines.join("\n")}\n`;
}

test("publisher waits until referenced segments exist before exposing master", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  let publisher;

  try {
    writeTextFile(sourceDir, "master.m3u8", buildMasterPlaylist());
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-1.m4s"], 0, "video-init.mp4"),
    );
    writeTextFile(
      sourceDir,
      "audio_eng.m3u8",
      buildMediaPlaylist(["audio-1.m4s"], 0, "audio-init.mp4"),
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(
      existsSync(join(targetDir, "master.m3u8")),
      false,
      "master should stay hidden until every referenced file is publishable",
    );

    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(
      sourceDir,
      "video-1.m4s",
      makeMediaSegment("video-segment"),
    );
    writeBinaryFile(sourceDir, "audio-init.mp4", Buffer.from("audio-init"));
    writeBinaryFile(
      sourceDir,
      "audio-1.m4s",
      makeMediaSegment("audio-segment"),
    );

    publisher = startLiveOutputPublisher({
      sourceDir,
      targetDir,
      intervalMs: 50,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(
      existsSync(join(targetDir, "master.m3u8")),
      false,
      "master should stay hidden until binary assets are seen stable twice",
    );

    await waitFor(() => {
      assert.equal(existsSync(join(targetDir, "master.m3u8")), true);
      assert.equal(existsSync(join(targetDir, "h264_720p.m3u8")), true);
      assert.equal(existsSync(join(targetDir, "audio_eng.m3u8")), true);
    });
  } finally {
    publisher?.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("publisher trims unavailable old segments from the public playlist", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  const publisher = startLiveOutputPublisher({
    sourceDir,
    targetDir,
    intervalMs: 20,
  });

  try {
    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(sourceDir, "video-3.m4s", makeMediaSegment("video-3"));
    writeBinaryFile(sourceDir, "video-4.m4s", makeMediaSegment("video-4"));
    writeBinaryFile(sourceDir, "audio-init.mp4", Buffer.from("audio-init"));
    writeBinaryFile(sourceDir, "audio-3.m4s", makeMediaSegment("audio-3"));
    writeBinaryFile(sourceDir, "audio-4.m4s", makeMediaSegment("audio-4"));
    writeTextFile(sourceDir, "master.m3u8", buildMasterPlaylist());
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(
        ["video-1.m4s", "video-2.m4s", "video-3.m4s", "video-4.m4s"],
        10,
        "video-init.mp4",
      ),
    );
    writeTextFile(
      sourceDir,
      "audio_eng.m3u8",
      buildMediaPlaylist(
        ["audio-1.m4s", "audio-2.m4s", "audio-3.m4s", "audio-4.m4s"],
        20,
        "audio-init.mp4",
      ),
    );

    await waitFor(() => {
      const videoPlaylist = readFileSync(
        join(targetDir, "h264_720p.m3u8"),
        "utf8",
      );
      const audioPlaylist = readFileSync(
        join(targetDir, "audio_eng.m3u8"),
        "utf8",
      );
      assert.match(videoPlaylist, /#EXT-X-MEDIA-SEQUENCE:12/);
      assert.doesNotMatch(videoPlaylist, /video-1\.m4s/);
      assert.doesNotMatch(videoPlaylist, /video-2\.m4s/);
      assert.match(videoPlaylist, /video-3\.m4s/);
      assert.match(videoPlaylist, /video-4\.m4s/);
      assert.match(audioPlaylist, /#EXT-X-MEDIA-SEQUENCE:22/);
      assert.doesNotMatch(audioPlaylist, /audio-1\.m4s/);
      assert.doesNotMatch(audioPlaylist, /audio-2\.m4s/);
      assert.match(audioPlaylist, /audio-3\.m4s/);
      assert.match(audioPlaylist, /audio-4\.m4s/);
      assert.equal(existsSync(join(targetDir, "master.m3u8")), true);
    });
  } finally {
    publisher.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("playlist publication snapshot trims the window to public-or-ready assets", () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const targetDir = join(tmpRoot, "target");

  try {
    writeBinaryFile(targetDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(targetDir, "video-1.m4s", makeMediaSegment("video-1"));

    const snapshot = buildPlaylistPublicationSnapshot(
      {
        relativePath: "h264_720p.m3u8",
        mtimeMs: Date.now(),
        mediaPlaylist: {
          headerLines: [
            "#EXTM3U",
            "#EXT-X-VERSION:7",
            "#EXT-X-TARGETDURATION:2",
            "#EXT-X-MEDIA-SEQUENCE:10",
            '#EXT-X-MAP:URI="video-init.mp4"',
          ],
          mapUris: ["video-init.mp4"],
          mediaSequence: 10,
          segments: [
            { extinfLine: "#EXTINF:2.0,", uri: "video-1.m4s" },
            { extinfLine: "#EXTINF:2.0,", uri: "video-2.m4s" },
            { extinfLine: "#EXTINF:2.0,", uri: "video-3.m4s" },
          ],
        },
      },
      targetDir,
      new Set(["video-2.m4s"]),
    );

    assert.ok(snapshot !== null);
    assert.match(snapshot.content, /video-1\.m4s/);
    assert.match(snapshot.content, /video-2\.m4s/);
    assert.doesNotMatch(snapshot.content, /video-3\.m4s/);
    assert.match(snapshot.content, /#EXT-X-MEDIA-SEQUENCE:10/);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("publisher filters master entries that never become publishable", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  const publisher = startLiveOutputPublisher({
    sourceDir,
    targetDir,
    intervalMs: 20,
  });

  try {
    writeTextFile(sourceDir, "master.m3u8", buildMasterPlaylist());
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-1.m4s"], 0, "video-init.mp4"),
    );
    writeTextFile(
      sourceDir,
      "audio_eng.m3u8",
      buildMediaPlaylist(["audio-eng-1.m4s"], 0, "audio-eng-init.mp4"),
    );
    writeTextFile(
      sourceDir,
      "audio_fra.m3u8",
      buildMediaPlaylist(["audio-fra-1.m4s"], 0, "audio-fra-init.mp4"),
    );

    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(
      sourceDir,
      "video-1.m4s",
      makeMediaSegment("video-segment"),
    );
    writeBinaryFile(
      sourceDir,
      "audio-eng-init.mp4",
      Buffer.from("audio-eng-init"),
    );
    writeBinaryFile(
      sourceDir,
      "audio-eng-1.m4s",
      makeMediaSegment("audio-eng-segment"),
    );
    writeBinaryFile(
      sourceDir,
      "audio-fra-init.mp4",
      Buffer.from("audio-fra-init"),
    );
    writeBinaryFile(
      sourceDir,
      "audio-fra-1.m4s",
      makeMediaSegment("audio-fra-segment"),
    );

    await waitFor(() => {
      const masterPlaylist = readFileSync(
        join(targetDir, "master.m3u8"),
        "utf8",
      );
      assert.match(masterPlaylist, /audio_eng\.m3u8/);
      assert.match(masterPlaylist, /audio_fra\.m3u8/);
      assert.doesNotMatch(masterPlaylist, /audio_arm\.m3u8/);
    });
  } finally {
    publisher.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("publisher status explains why referenced audio playlists are excluded", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  const publisher = startLiveOutputPublisher({
    sourceDir,
    targetDir,
    intervalMs: 20,
  });

  try {
    writeTextFile(sourceDir, "master.m3u8", buildMasterPlaylist());
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-1.m4s"], 0, "video-init.mp4"),
    );
    writeTextFile(
      sourceDir,
      "audio_eng.m3u8",
      buildMediaPlaylist(["audio-1.m4s"], 0, "audio-init.mp4"),
    );

    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(
      sourceDir,
      "video-1.m4s",
      makeMediaSegment("video-segment"),
    );

    await waitFor(() => {
      const status = JSON.parse(
        readFileSync(getPublisherStatusPath(targetDir), "utf8"),
      );
      assert.equal(status.status, "ready");
      assert.deepEqual(status.diagnostics.sourceMaster, {
        variantEntryCount: 1,
        audioEntryCount: 3,
        ignoredInvalidAudioEntryCount: 0,
      });
      assert.deepEqual(status.diagnostics.preparedMaster, {
        variantEntryCount: 1,
        audioEntryCount: 0,
      });
      assert.match(
        JSON.stringify(status.diagnostics.playlists),
        /"playlistName":"audio_eng\.m3u8","status":"missing-map-asset","detail":"audio-init\.mp4"/,
      );
      assert.match(
        JSON.stringify(status.diagnostics.playlists),
        /"playlistName":"audio_fra\.m3u8","status":"missing-playlist-file"/,
      );
      assert.match(
        JSON.stringify(status.diagnostics.playlists),
        /"playlistName":"audio_arm\.m3u8","status":"missing-playlist-file"/,
      );
    });
  } finally {
    publisher.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("publisher ignores media playlists with a blank URI after EXTINF", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  const publisher = startLiveOutputPublisher({
    sourceDir,
    targetDir,
    intervalMs: 20,
  });

  try {
    writeTextFile(
      sourceDir,
      "master.m3u8",
      `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=2500000
h264_720p.m3u8
`,
    );
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:2
#EXT-X-MAP:URI="video-init.mp4"
#EXTINF:2.0,

video-1.m4s
`,
    );
    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(sourceDir, "video-1.m4s", makeMediaSegment("video-1"));

    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(
      existsSync(join(targetDir, "h264_720p.m3u8")),
      false,
      "playlist with a blank media URI should never be published",
    );
    assert.equal(
      existsSync(join(targetDir, "master.m3u8")),
      false,
      "master should stay hidden when its child media playlist is incomplete",
    );
  } finally {
    publisher.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("publisher ignores master playlists with a blank URI after EXT-X-STREAM-INF", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  const publisher = startLiveOutputPublisher({
    sourceDir,
    targetDir,
    intervalMs: 20,
  });

  try {
    writeTextFile(
      sourceDir,
      "master.m3u8",
      `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=2500000

h264_720p.m3u8
`,
    );
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-1.m4s"], 0, "video-init.mp4"),
    );
    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(sourceDir, "video-1.m4s", makeMediaSegment("video-1"));

    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(
      existsSync(join(targetDir, "master.m3u8")),
      false,
      "master with a blank variant URI should not be published",
    );
  } finally {
    publisher.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("publisher ignores master playlists with a corrupted audio URI", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  const publisher = startLiveOutputPublisher({
    sourceDir,
    targetDir,
    intervalMs: 20,
  });

  try {
    writeTextFile(
      sourceDir,
      "master.m3u8",
      `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Broken",DEFAULT=NO,AUTOSELECT=YES,URI="0���>\u0002"
#EXT-X-STREAM-INF:BANDWIDTH=2500000,AUDIO="audio"
h264_720p.m3u8
`,
    );
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-1.m4s"], 0, "video-init.mp4"),
    );
    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(sourceDir, "video-1.m4s", makeMediaSegment("video-1"));

    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(
      existsSync(join(targetDir, "master.m3u8")),
      false,
      "master with a corrupted audio URI should not be published",
    );

    const status = JSON.parse(
      readFileSync(getPublisherStatusPath(targetDir), "utf8"),
    );
    assert.equal(status.status, "invalid-master");
    assert.equal(status.detail.reason, "invalid-media-uri");
  } finally {
    publisher.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("publisher publishes valid audio renditions even if another audio URI is corrupted", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  const publisher = startLiveOutputPublisher({
    sourceDir,
    targetDir,
    intervalMs: 20,
  });

  try {
    writeTextFile(
      sourceDir,
      "master.m3u8",
      `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Broken",DEFAULT=NO,AUTOSELECT=YES,URI="0���>\u0002"
#EXT-X-STREAM-INF:BANDWIDTH=2500000,AUDIO="audio"
h264_720p.m3u8
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,AUTOSELECT=YES,URI="audio_eng.m3u8"
`,
    );
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-1.m4s"], 0, "video-init.mp4"),
    );
    writeTextFile(
      sourceDir,
      "audio_eng.m3u8",
      buildMediaPlaylist(["audio-1.m4s"], 0, "audio-init.mp4"),
    );
    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(sourceDir, "audio-init.mp4", Buffer.from("audio-init"));
    writeBinaryFile(sourceDir, "video-1.m4s", makeMediaSegment("video-1"));
    writeBinaryFile(sourceDir, "audio-1.m4s", makeMediaSegment("audio-1"));

    await waitFor(() => {
      assert.equal(existsSync(join(targetDir, "master.m3u8")), true);
      assert.equal(existsSync(join(targetDir, "audio_eng.m3u8")), true);
    });

    const master = readFileSync(join(targetDir, "master.m3u8"), "utf8");
    assert.match(master, /audio_eng\.m3u8/);
    assert.doesNotMatch(master, /0���>\u0002/);

    const status = JSON.parse(
      readFileSync(getPublisherStatusPath(targetDir), "utf8"),
    );
    assert.equal(status.status, "ready");
    assert.equal(
      status.diagnostics.sourceMaster.ignoredInvalidAudioEntryCount,
      1,
    );
  } finally {
    publisher.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("publisher waits for identical binary bytes across cycles before publishing", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  let publisher;

  try {
    writeTextFile(
      sourceDir,
      "master.m3u8",
      `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=2500000
h264_720p.m3u8
`,
    );
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-1.m4s"], 0, "video-init.mp4"),
    );
    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(sourceDir, "video-1.m4s", makeMediaSegment("aaaaaa"));

    publisher = startLiveOutputPublisher({
      sourceDir,
      targetDir,
      intervalMs: 50,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    writeBinaryFile(sourceDir, "video-1.m4s", makeMediaSegment("bbbbbb"));

    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(
      existsSync(join(targetDir, "video-1.m4s")),
      false,
      "segment bytes changed across cycles and should not have been published yet",
    );

    await waitFor(() => {
      assert.equal(existsSync(join(targetDir, "video-1.m4s")), true);
      assert.deepEqual(
        readFileSync(join(targetDir, "video-1.m4s")),
        makeMediaSegment("bbbbbb"),
      );
    });
  } finally {
    publisher?.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("publisher waits for identical source text bytes before accepting a rewritten master", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  let publisher;

  try {
    writeTextFile(
      sourceDir,
      "master.m3u8",
      `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Broken",DEFAULT=NO,AUTOSELECT=YES,URI="0���>\u0002"
#EXT-X-STREAM-INF:BANDWIDTH=2500000,AUDIO="audio"
h264_720p.m3u8
`,
    );
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-1.m4s"], 0, "video-init.mp4"),
    );
    writeTextFile(
      sourceDir,
      "audio_eng.m3u8",
      buildMediaPlaylist(["audio-1.m4s"], 0, "audio-init.mp4"),
    );
    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(sourceDir, "audio-init.mp4", Buffer.from("audio-init"));
    writeBinaryFile(sourceDir, "video-1.m4s", makeMediaSegment("video-1"));
    writeBinaryFile(sourceDir, "audio-1.m4s", makeMediaSegment("audio-1"));

    publisher = startLiveOutputPublisher({
      sourceDir,
      targetDir,
      intervalMs: 50,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    writeTextFile(
      sourceDir,
      "master.m3u8",
      `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,AUTOSELECT=YES,URI="audio_eng.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2500000,AUDIO="audio"
h264_720p.m3u8
`,
    );

    await new Promise((resolve) => setTimeout(resolve, 70));
    assert.equal(
      existsSync(join(targetDir, "master.m3u8")),
      false,
      "rewritten source master should stay hidden until its bytes repeat",
    );

    await waitFor(() => {
      const master = readFileSync(join(targetDir, "master.m3u8"), "utf8");
      assert.match(master, /audio_eng\.m3u8/);
      assert.doesNotMatch(master, /0���>\u0002/);
    });

    const status = JSON.parse(
      readFileSync(getPublisherStatusPath(targetDir), "utf8"),
    );
    assert.equal(status.status, "ready");
  } finally {
    publisher?.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("publisher keeps using the last stable master while a torn rewrite is invalid", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  let publisher;

  try {
    writeTextFile(
      sourceDir,
      "master.m3u8",
      `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,AUTOSELECT=YES,URI="audio_eng.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2500000,AUDIO="audio"
h264_720p.m3u8
`,
    );
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-1.m4s"], 0, "video-init.mp4"),
    );
    writeTextFile(
      sourceDir,
      "audio_eng.m3u8",
      buildMediaPlaylist(["audio-1.m4s"], 0, "audio-init.mp4"),
    );
    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(sourceDir, "audio-init.mp4", Buffer.from("audio-init"));
    writeBinaryFile(sourceDir, "video-1.m4s", makeMediaSegment("video-1"));
    writeBinaryFile(sourceDir, "audio-1.m4s", makeMediaSegment("audio-1"));

    publisher = startLiveOutputPublisher({
      sourceDir,
      targetDir,
      intervalMs: 50,
    });

    await waitFor(() => {
      const status = JSON.parse(
        readFileSync(getPublisherStatusPath(targetDir), "utf8"),
      );
      assert.equal(status.status, "ready");
      assert.equal(existsSync(join(targetDir, "master.m3u8")), true);
      assert.deepEqual(status.diagnostics.masterSource, {
        contentSource: "source",
        fallbackReason: null,
      });
    });

    writeTextFile(
      sourceDir,
      "master.m3u8",
      `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,AUTOSELECT=YES,URI=""
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="French",DEFAULT=NO,AUTOSELECT=YES,URI=""
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Armenian",DEFAULT=NO,AUTOSELECT=YES,URI="0���>\u0002"
#EXT-X-STREAM-INF:BANDWIDTH=2500000,AUDIO="audio"
h264_720p.m3u8
`,
    );
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-1.m4s", "video-2.m4s"], 0, "video-init.mp4"),
    );
    writeBinaryFile(sourceDir, "video-2.m4s", makeMediaSegment("video-2"));

    await waitFor(() => {
      const status = JSON.parse(
        readFileSync(getPublisherStatusPath(targetDir), "utf8"),
      );
      assert.equal(status.status, "ready");
      assert.deepEqual(status.diagnostics.masterSource, {
        contentSource: "cached",
        fallbackReason: "invalid-master",
      });
      const master = readFileSync(join(targetDir, "master.m3u8"), "utf8");
      assert.match(master, /audio_eng\.m3u8/);
      assert.doesNotMatch(master, /URI=""/);
      assert.equal(existsSync(join(targetDir, "video-2.m4s")), true);
    });
  } finally {
    publisher?.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("publisher ignores mtime-only rewrites when text bytes stay identical", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  const publisher = startLiveOutputPublisher({
    sourceDir,
    targetDir,
    intervalMs: 50,
  });

  try {
    const master = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,AUTOSELECT=YES,URI="audio_eng.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2500000,AUDIO="audio"
h264_720p.m3u8
`;
    writeTextFile(sourceDir, "master.m3u8", master);
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-1.m4s"], 0, "video-init.mp4"),
    );
    writeTextFile(
      sourceDir,
      "audio_eng.m3u8",
      buildMediaPlaylist(["audio-1.m4s"], 0, "audio-init.mp4"),
    );
    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(sourceDir, "audio-init.mp4", Buffer.from("audio-init"));
    writeBinaryFile(sourceDir, "video-1.m4s", makeMediaSegment("video-1"));
    writeBinaryFile(sourceDir, "audio-1.m4s", makeMediaSegment("audio-1"));

    await new Promise((resolve) => setTimeout(resolve, 10));
    writeTextFile(sourceDir, "master.m3u8", master);

    await waitFor(() => {
      assert.equal(existsSync(join(targetDir, "master.m3u8")), true);
    });
  } finally {
    publisher.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("publisher ignores truncated mp4 fragments", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  const publisher = startLiveOutputPublisher({
    sourceDir,
    targetDir,
    intervalMs: 20,
  });

  try {
    writeTextFile(
      sourceDir,
      "master.m3u8",
      `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=2500000
h264_720p.m3u8
`,
    );
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-1.m4s"], 0, "video-init.mp4"),
    );
    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(
      sourceDir,
      "video-1.m4s",
      Buffer.concat([makeBox("moof", Buffer.from("traf")), Buffer.from("bad")]),
    );

    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(
      existsSync(join(targetDir, "video-1.m4s")),
      false,
      "truncated fragment should not be published",
    );

    writeBinaryFile(sourceDir, "video-1.m4s", makeMediaSegment("video-1"));

    await waitFor(() => {
      assert.equal(existsSync(join(targetDir, "video-1.m4s")), true);
      assert.equal(existsSync(join(targetDir, "h264_720p.m3u8")), true);
      assert.equal(existsSync(join(targetDir, "master.m3u8")), true);
    });
  } finally {
    publisher.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("publisher ignores tiny fragments even when top-level boxes exist", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  const publisher = startLiveOutputPublisher({
    sourceDir,
    targetDir,
    intervalMs: 20,
  });

  try {
    writeTextFile(
      sourceDir,
      "master.m3u8",
      `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=2500000
h264_720p.m3u8
`,
    );
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-1.m4s"], 0, "video-init.mp4"),
    );
    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(
      sourceDir,
      "video-1.m4s",
      Buffer.concat([
        makeBox("styp", Buffer.from("msdh")),
        makeBox("moof", Buffer.alloc(16)),
        makeBox("mdat", Buffer.from("x")),
      ]),
    );

    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(
      existsSync(join(targetDir, "video-1.m4s")),
      false,
      "tiny fragment should not be published",
    );

    writeBinaryFile(sourceDir, "video-1.m4s", makeMediaSegment("video-1"));

    await waitFor(() => {
      assert.equal(existsSync(join(targetDir, "video-1.m4s")), true);
    });
  } finally {
    publisher.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("publisher updates existing public files when source advances", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "wasp-hls-publisher-"));
  const sourceDir = join(tmpRoot, "source");
  const targetDir = join(tmpRoot, "target");
  const publisher = startLiveOutputPublisher({
    sourceDir,
    targetDir,
    intervalMs: 20,
  });

  try {
    writeTextFile(
      sourceDir,
      "master.m3u8",
      `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=2500000
h264_720p.m3u8
`,
    );
    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-1.m4s"], 0, "video-init.mp4"),
    );
    writeBinaryFile(sourceDir, "video-init.mp4", Buffer.from("video-init"));
    writeBinaryFile(sourceDir, "video-1.m4s", makeMediaSegment("video-1"));

    await waitFor(() => {
      assert.match(
        readFileSync(join(targetDir, "h264_720p.m3u8"), "utf8"),
        /video-1\.m4s/,
      );
      assert.deepEqual(
        readFileSync(join(targetDir, "video-1.m4s")),
        makeMediaSegment("video-1"),
      );
    });

    writeTextFile(
      sourceDir,
      "h264_720p.m3u8",
      buildMediaPlaylist(["video-2.m4s"], 1, "video-init.mp4"),
    );
    writeBinaryFile(sourceDir, "video-2.m4s", makeMediaSegment("video-2"));

    await waitFor(() => {
      const playlist = readFileSync(join(targetDir, "h264_720p.m3u8"), "utf8");
      assert.match(playlist, /video-2\.m4s/);
      assert.doesNotMatch(playlist, /video-1\.m4s/);
      assert.deepEqual(
        readFileSync(join(targetDir, "video-2.m4s")),
        makeMediaSegment("video-2"),
      );
    });
  } finally {
    publisher.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});
