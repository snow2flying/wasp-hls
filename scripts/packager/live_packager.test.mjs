import assert from "node:assert/strict";
import test from "node:test";

import { buildPortMap } from "../../scripts/packager/ports.mjs";
import { DEFAULT_CONFIG } from "../../scripts/packager/constants.mjs";
import { buildGpacArgs } from "../../scripts/packager/live_packager.mjs";

test("buildGpacArgs optionally enables HLS program date time tags", () => {
  const ports = buildPortMap(DEFAULT_CONFIG.basePort);
  const outputDir = "/tmp/packager-out";

  const withoutProgramDateTime = buildGpacArgs(
    {
      ...DEFAULT_CONFIG,
      emitProgramDateTime: false,
    },
    ports,
    outputDir,
  );
  const withProgramDateTime = buildGpacArgs(
    {
      ...DEFAULT_CONFIG,
      emitProgramDateTime: true,
    },
    ports,
    outputDir,
  );

  const withoutOutputArg = withoutProgramDateTime.at(-1);
  const withOutputArg = withProgramDateTime.at(-1);

  assert.equal(typeof withoutOutputArg, "string");
  assert.equal(typeof withOutputArg, "string");
  if (withoutOutputArg === undefined || withOutputArg === undefined) {
    throw new Error("GPAC args should always include an output argument.");
  }
  assert.doesNotMatch(withoutOutputArg, /:hlsc(?:$|:)/);
  assert.match(withOutputArg, /:hlsc(?:$|:)/);
});
