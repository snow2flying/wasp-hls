/**
 * ============= wasm-strip util =============
 *
 * == What is this?
 *
 * This file allows to remove debugging information from a WebAssembly binary
 * file (`.wasm`).
 *
 *
 * == Why?
 *
 * To remove custom sections, which are mostly debug symbols, for our release
 * builds to win some KB.
 *
 * Ultimately, the difference is not that big, even more when considering that
 * we're a media player who is surely going to load some multi-MB media files
 * anyway.
 *
 * But I still decided to do this nonetheless for the following reasons:
 *
 *   - "Big .wasm file sizes" is a frequently used reason against relying on
 *     WebAssembly for web-application. Here saving tens of KB may make some
 *     difference to some.
 *
 *   - Debug symbols aren't that useful on release, we already use build
 *     releases with them while debugging and at worst we have logs that can
 *     be enabled at any time.
 *
 *   - This is fun (OOooooh Bring the 707 out)
 *
 * == How?
 *
 * As it turns out, this task is pretty simple as WebAssembly files are very
 * easy to parse and have a very clear specification.
 *
 * The most important specification page for that util is the one describing the
 * format of "modules" in the binary format:
 * https://webassembly.github.io/spec/core/binary/modules.html
 *
 * To ensure I was not going in a totally wrong direction, I also read the
 * code of the equivalent "wasm-strip" C util - part of the `wabt` toolkit.
 * The issue with that tool - and the reason I chose to re-write that in
 * node.js - was that this tool would both bring yet another language in the
 * code and also needs to be compiled.
 *
 * Turns out that I felt node.js stream-oriented filesystem APIs much more
 * painful to exploit than I first expected, but I hope it turned out OK.
 */

import fs from "fs";

// Promise versions will be easier to work with here
import { access, stat } from "fs/promises";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: node ./scripts/wasm-strip.js <wasm-file>

Removes custom sections such as debug symbols from the given wasm binary in
place.`);
  process.exit(0);
}

/** Magic number a WebAssembly file should start with. */
const WASM_MAGIC_NUMBER = 0x0061736d;

/**
 * Id for the "Custom" sections of a WebAssembly files.
 * Those are either for debugging information or non-standard extensions.
 *
 * Those sections is what this tool remove.
 */
const CUSTOM_SECTION_ID = 0;

run();

/** @typedef {{ sectionType: number; offset: number; contentSize: number; length: number }} WasmSectionInfo */
/** @typedef {{ keptSections: WasmSectionInfo[]; removedSections: WasmSectionInfo[] }} StripResult */

/** @returns {Promise<void>} */
async function run() {
  /** @type {string} */
  let fileName;
  /** @type {string} */
  let tmpName;

  try {
    fileName = extractFileNameFromArgs();
  } catch (err) {
    onFatalError(err);
  }
  console.log("Starting logic to strip wasm file:", fileName);

  /**
   * Promise emitting the size of the original file.
   * We need it much later, in the result, but as this is async better doing it
   * ASAP.
   */
  const initialFileSizeProm = stat(fileName).then((s) => s.size);

  try {
    tmpName = await getTmpName(fileName);
  } catch (err) {
    onFatalError(err);
  }
  console.log("A temporary file will be created:", tmpName);

  const readStream = fs.createReadStream(fileName);
  const writeStream = fs.createWriteStream(tmpName);

  let result;
  try {
    result = await readAndStripWasm(readStream, writeStream);
  } catch (err) {
    onFatalError(err, tmpName);
  }
  readStream.close();

  try {
    await waitForWriteStreamFinish(writeStream);
  } catch (err) {
    onFatalError(err, tmpName);
  }
  console.log("Stripping has been done, checking...");

  const nbBytesRemoved = result.removedSections.reduce(
    (acc, r) => acc + r.length,
    0,
  );

  let initialFileSize;
  try {
    initialFileSize = await initialFileSizeProm;
  } catch (err) {
    onFatalError(err, tmpName);
  }

  let newFileSize;
  try {
    newFileSize = await stat(tmpName).then((s) => s.size);
  } catch (err) {
    onFatalError(err, tmpName);
  }

  // TODO better validation?
  if (initialFileSize - nbBytesRemoved !== newFileSize) {
    const expected = initialFileSize - nbBytesRemoved;
    const err = new Error(
      `Expected a file of ${expected} bytes, ` +
        `actually got ${newFileSize} bytes.`,
    );
    onFatalError(err, tmpName);
  }
  console.log("Check succeed! Moving temporary file back to original file...");
  try {
    fs.renameSync(tmpName, fileName);
  } catch (err) {
    onFatalError(err, tmpName);
  }

  if (nbBytesRemoved === 0) {
    console.log(
      "Nothing was removed, your wasm file was already devoid of the " +
        "sections stripped by this tool.",
    );
  } else {
    console.log(
      `Success!\nRemoved ${nbBytesRemoved} bytes by stripping ` +
        `out ${result.removedSections.length} sections.\n` +
        `Size went from ${initialFileSize}B to ${newFileSize}B.`,
    );
  }
  process.exit(0);
}

/**
 * @param {unknown} err
 * @param {string} [tmpName]
 * @returns {never}
 */
function onFatalError(err, tmpName) {
  const message = err instanceof Error ? err.message : String(err ?? "Unknown");
  console.error("Error:", message);
  if (tmpName !== undefined) {
    try {
      fs.unlinkSync(tmpName);
    } catch (_err) {
      console.error("Error: Could not remove temporary file:", tmpName);
    }
  }
  process.exit(1);
}

/**
 * @param {fs.WriteStream} writeStream
 * @returns {Promise<void>}
 */
function waitForWriteStreamFinish(writeStream) {
  return /** @type {Promise<void>} */ (
    new Promise((res, rej) => {
      writeStream.on("finish", () => {
        res();
      });
      writeStream.on("error", rej);
      writeStream.end();
    })
  );
}

/**
 * TODO exploit writeStream.write "drain" response?
 * TODO add writeStream.write callback? (Maybe a wrapper might be the easiest
 * way to do both)
 * @param {fs.ReadStream} readStream
 * @param {fs.WriteStream} writeStream
 * @returns {Promise<StripResult>}
 */
function readAndStripWasm(readStream, writeStream) {
  return new Promise((res, rej) => {
    /** @type {StripResult} */
    const result = {
      keptSections: [],
      removedSections: [],
    };
    /** @type {ArrayBuffer | null} */
    let prevBuffered = null;
    let checkedMagicAndVersion = false;
    let currOffset = 0;
    let nextSectionOffset = 8;
    let maxOffsetInChunk = 0;
    let skipCurrentSection = false;

    readStream.on("end", () => {
      if (prevBuffered !== null) {
        onNext(prevBuffered);
      }

      if (maxOffsetInChunk !== nextSectionOffset) {
        rej(new Error("EOF encountered before the end"));
        return;
      }
      res(result);
    });

    readStream.on(
      "data",
      /** @param {string | Buffer} chunk */
      (chunk) => {
      const chunkBuffer =
        typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      const buff =
        prevBuffered === null
          ? toArrayBuffer(chunkBuffer)
          : concatArrayBuffers(prevBuffered, toArrayBuffer(chunkBuffer));
      onNext(buff);
      },
    );

    /** @param {ArrayBuffer} buff */
    function onNext(buff) {
      maxOffsetInChunk = currOffset + buff.byteLength;
      const chunkBaseOffset = currOffset;

      if (!checkedMagicAndVersion) {
        if (buff.byteLength < 8) {
          prevBuffered = buff;
          return;
        }
        checkMagicNumberAndVersion(buff);
        checkedMagicAndVersion = true;
        writeStream.write(Buffer.from(buff.slice(0, 8)));
        currOffset += 8;
      }

      while (currOffset < maxOffsetInChunk) {
        if (nextSectionOffset === currOffset) {
          const relativeOffset = currOffset - chunkBaseOffset;
          if (
            buff.byteLength - relativeOffset <
            6 /* id + max LEB128 u32 size */
          ) {
            prevBuffered = buff.slice(relativeOffset);
            return;
          }
          const dataView = new DataView(buff);
          const sectionType = dataView.getUint8(relativeOffset);
          const [size, sizeOfSize] = readULeb128(dataView, relativeOffset + 1);

          /** @type {WasmSectionInfo} */
          const sectionInfo = {
            sectionType,
            offset: currOffset,
            contentSize: size,
            length: size + 1 + sizeOfSize,
          };
          currOffset += 1 + sizeOfSize; // Section id + size

          if (sectionType === CUSTOM_SECTION_ID) {
            skipCurrentSection = true;
            result.removedSections.push(sectionInfo);
          } else {
            skipCurrentSection = false;
            writeStream.write(
              Buffer.from(
                buff.slice(relativeOffset, currOffset - chunkBaseOffset),
              ),
            );
            result.keptSections.push(sectionInfo);
          }
          nextSectionOffset = size + currOffset;
        }
        const newOffset = Math.min(maxOffsetInChunk, nextSectionOffset);
        if (!skipCurrentSection) {
          writeStream.write(
            Buffer.from(
              buff.slice(
                currOffset - chunkBaseOffset,
                newOffset - chunkBaseOffset,
              ),
            ),
          );
        }
        currOffset = newOffset;
      }
    }
  });
}

/**
 * @param {ArrayBuffer} buff
 */
function checkMagicNumberAndVersion(buff) {
  if (buff.byteLength < 8) {
    throw new Error("Error: Not a valid WebAssembly file: file too short");
  }
  const dataView = new DataView(buff);
  if (dataView.getUint32(0) !== WASM_MAGIC_NUMBER) {
    throw new Error("Error: Not a valid WebAssembly file: no magic number");
  }
  if (dataView.getUint32(4, true) !== 1) {
    throw new Error(
      `Error: Unsupported WebAssembly version: ${dataView.getUint32(4, true)}`,
    );
  }
}

/**
 * @param {Buffer} buff
 * @returns {ArrayBuffer}
 */
function toArrayBuffer(buff) {
  return Uint8Array.from(buff).buffer;
}

/**
 * @param {...ArrayBuffer} buffers
 * @returns {ArrayBuffer}
 */
function concatArrayBuffers(...buffers) {
  const ret = new Uint8Array(
    buffers.reduce((acc, buff) => acc + buff.byteLength, 0),
  );
  let currOffset = 0;
  for (let i = 0; i < buffers.length; i++) {
    const buffer = buffers[i];
    ret.set(new Uint8Array(buffer), currOffset);
    currOffset += buffer.byteLength;
  }
  return ret.buffer;
}

/**
 * WebAssembly got that weird "LEB128" integer format.
 *
 * This function parses the unsigned version into a JS number.
 * @param {DataView} dv
 * @param {number} offset - Offset, in bytes, in the buffer where that number
 * starts.
 * @returns {[number, number]}
 */
function readULeb128(dv, offset) {
  let res = 0;
  let currShift = 0;
  let currOffset = offset;
  let nbSize = 0;
  while (currOffset < dv.byteLength) {
    // take next bytesize=0x00000070
    const byte = dv.getInt8(currOffset);

    // do some shenanigans to extract the interesting value.
    // (all but the highest bit, which just tells us when this is the end).
    const val = byte & 0x7f;

    res |= val << currShift;
    nbSize++;

    // higher bit set to 0 == end of number
    // Note: the parentheses seems to be VERY important there, lost too much
    // time on that one
    if ((byte & 0x80) === 0) {
      return [res, nbSize];
    }
    currShift += 7;
    currOffset += 1;
  }
  throw new Error("Error: EOF in parsed integer");
}

/**
 * Generate name of the temporary file by adding ".tmp" at the end of it.
 * If that file already exists, adds ".tmp_2" instead.
 * If that file also already exists, adds ".tmp_3" instead.
 * And so on.
 * @param {string} fileName - The original file name.
 * @returns {Promise.<string>} - Emit the generated name.
 * Reject if unable to do so;
 * never reject.
 */
async function getTmpName(fileName) {
  let i = 1;
  while (true) {
    if (i > 1000) {
      throw new Error(
        "Error: Too many temporary files, check if there's " +
          "something wrong with this script.",
      );
    }

    const tmpFileName = fileName + ".tmp" + (i === 1 ? "" : `_${i}`);
    try {
      await access(tmpFileName);
      i++;
    } catch (_e) {
      return tmpFileName;
    }
  }
}

/** @returns {string} */
function extractFileNameFromArgs() {
  const processArgs = process.argv.slice(2);

  if (processArgs.length === 0) {
    throw new Error("Error: Missing filename argument");
  }

  return processArgs[0];
}
