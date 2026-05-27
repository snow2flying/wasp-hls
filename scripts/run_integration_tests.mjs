#!/usr/bin/env node
/**
 * # run_integration_tests.mjs
 *
 * This file allows to run the integration test suite by running the `vitest`
 * dependency on them with the right options.
 *
 * You can either run it directly as a script (run
 * `node run_integration_tests.mjs -h` to see the different options) or by
 * requiring it as a node module. If doing the latter you will obtain a
 * function you will have to run with the right options.
 */

import { pathToFileURL } from "url";
import { resolve } from "path";
import { createVitest, startVitest } from "vitest/node";
import { webdriverio } from "@vitest/browser-webdriverio";

/** If not specified, run only this browser. */
const DEFAULT_BROWSER = "chrome";

/**
 * First-run browser provisioning can include downloading Chrome/Firefox
 * through WebdriverIO, which is counted against Vitest's browser connect
 * timeout. Use a higher value to avoid timing out on slower connections.
 */
const BROWSER_CONNECT_TIMEOUT = 5 * 60 * 1000;

/** Paths were integration tests are defined. */
const INTEGRATION_TEST_FILES = [
  "tests/integration/scenarios/**/*.[jt]s?(x)",
  "tests/integration/**/*.test.[jt]s?(x)",
];

const baseGlobals = {
  __TEST_CONTENT_SERVER__: {
    URL: "127.0.0.1",
    PORT: 3000,
  },
  __ENVIRONMENT__: {
    PRODUCTION: 0,
    DEV: 1,
    CURRENT_ENV: 1,
  },
  __LOGGER_LEVEL__: {
    CURRENT_LEVEL: '"NONE"',
  },
};

const WDIO_CACHE_DIR = resolve(
  process.cwd(),
  process.env.WASP_HLS_WDIO_CACHE_DIR ?? "tmp/wdio-cache",
);

/**
 * @param {Object} config - The test configuration object.
 * @param {string} config.browser - The browser chosen to run the tests.
 * Can be `"chrome"`, `"firefox"` or `"edge"`.
 * @param {boolean} config.watch - If `true`, re-run tests when a depended file
 * changed.
 * @param {Array.<string>} testFilters - The filters you can pass to vitest ot
 * only run some tests.
 * @returns {Promise.<Object>} - The vitest object.
 */
export default function runVitests({ browser, watch }, testFilters = []) {
  return startVitest(
    "test",
    testFilters,
    {
      reporters: "dot",
      watch,
      globalSetup: "tests/globalSetup.mjs",
      projects: [generateTestConfig({ browser })],
    },
    {
      test: {
        browser: {
          connectTimeout: BROWSER_CONNECT_TIMEOUT,
        },
      },
    },
  );
}

async function runVitestsWithManagedExit({ browser, watch }, testFilters = []) {
  if (watch) {
    return runVitests({ browser, watch }, testFilters);
  }

  process.env.TEST = "true";
  process.env.VITEST = "true";
  process.env.NODE_ENV ??= "test";

  const ctx = await createVitest(
    "test",
    {
      reporters: "dot",
      watch: false,
      globalSetup: "tests/globalSetup.mjs",
      projects: [generateTestConfig({ browser })],
    },
    {
      test: {
        browser: {
          connectTimeout: BROWSER_CONNECT_TIMEOUT,
        },
      },
    },
  );

  try {
    await ctx.start(testFilters);
    return ctx;
  } finally {
    if (!ctx.shouldKeepServer()) {
      await ctx.exit();
    }
  }
}

/**
 * Generate the configuration associated to a particular browser adapted to
 * RxPlayer tests (headless, autoplay enabled, memory control...).
 * @param {string} browser - The browser chosen to run the tests.
 * Can be `"chrome"`, `"firefox"` or `"edge"`.
 * @returns {Object} - The `vitest`'s `browser` config to set to run that
 * browser.
 */
function getBrowserConfig(browser) {
  const providerOptions = getWdioProviderOptions(browser);
  switch (browser) {
    case "chrome":
      return {
        enabled: true,
        provider: webdriverio(providerOptions),
        headless: true,
        screenshotFailures: false,
        instances: [
          {
            browser: "chrome",
          },
        ],
      };

    case "firefox":
      return {
        enabled: true,
        provider: webdriverio(providerOptions),
        headless: true,
        screenshotFailures: false,
        instances: [
          {
            browser: "firefox",
          },
        ],
      };

    case "edge":
      return {
        enabled: true,
        provider: webdriverio(providerOptions),
        headless: true,
        screenshotFailures: false,
        instances: [
          {
            browser: "edge",
          },
        ],
      };

    default:
      return {
        enabled: false,
      };
  }
}

/**
 * @param {"chrome" | "firefox" | "edge"} browser
 * @returns {import("@vitest/browser-webdriverio").WebdriverProviderOptions}
 */
function getWdioProviderOptions(browser) {
  return {
    cacheDir: WDIO_CACHE_DIR,
    logLevel: process.env.WASP_HLS_WDIO_LOG_LEVEL ?? "warn",
    capabilities: buildBrowserCapabilities(browser),
  };
}

/**
 * @param {"chrome" | "firefox" | "edge"} browser
 * @returns {Record<string, unknown>}
 */
function buildBrowserCapabilities(browser) {
  switch (browser) {
    case "chrome":
      return {
        browserName: "chrome",
        "goog:chromeOptions": {
          args: [
            "--autoplay-policy=no-user-gesture-required",
            "--enable-precise-memory-info",
            "--js-flags=--expose-gc",
          ],
        },
      };
    case "firefox":
      return {
        browserName: "firefox",
        "moz:firefoxOptions": {
          prefs: {
            "media.autoplay.default": 0,
            "media.autoplay.enabled.user-gestures-needed": false,
            "media.autoplay.block-webaudio": false,
            "media.autoplay.ask-permission": false,
            "media.autoplay.block-event.enabled": false,
            "media.block-autoplay-until-in-foreground": false,
          },
        },
      };
    case "edge":
      return {
        browserName: "edge",
        "ms:edgeOptions": {
          args: ["--autoplay-policy=no-user-gesture-required"],
        },
      };
  }
}

/**
 * @param {Object} config - The test configuration object.
 * @param {string} config.browser - The browser chosen to run the tests.
 * Can be `"chrome"`, `"firefox"` or `"edge"`.
 * @returns {Object} - The corresponding `vitest` config.
 */
function generateTestConfig({ browser }) {
  const includedFiles = INTEGRATION_TEST_FILES;
  return {
    test: {
      name: browser,
      browser: getBrowserConfig(browser),
      include: includedFiles,
      globals: false,
    },
    define: {
      ...baseGlobals,
      __BROWSER_NAME__: JSON.stringify(browser),
    },
  };
}

// If true, this script is called directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}

async function main() {
  const args = process.argv.slice(2);
  let shouldWatch = false;
  // TODO: multiple browsers?
  let browser = "";
  const filters = [];

  if (args[0] === "-h" || args[0] === "--help") {
    displayHelp();
    process.exit(0);
  }
  for (let argOffset = 0; argOffset < args.length; argOffset++) {
    const currentArg = args[argOffset];
    switch (currentArg) {
      case "-h":
      case "--help":
        displayHelp();
        process.exit(0);
        break;

      case "-w":
      case "--watch":
        shouldWatch = true;
        break;

      case "-f":
      case "--filter":
        {
          argOffset++;
          const newFilter = args[argOffset];
          if (newFilter === undefined) {
            console.error(`ERROR: no filter provided to ${currentArg} flag.\n`);
            displayHelp();
            process.exit(1);
          }
          filters.push(newFilter);
        }
        break;

      case "-b":
      case "--browser":
        {
          argOffset++;
          browser = args[argOffset];
          if (browser === undefined) {
            console.error("ERROR: no browser name provided\n");
            displayHelp();
            process.exit(1);
          }
          if (!["chrome", "firefox", "edge"].includes(browser)) {
            console.error(
              'ERROR: Invalid browser name provided.\nOnly "chrome", "firefox" or "edge" is authorized',
            );
            displayHelp();
            process.exit(1);
          }
        }
        break;

      case "--":
        argOffset = args.length;
        break;

      default: {
        console.error('ERROR: unknown option: "' + currentArg + '"\n');
        displayHelp();
        process.exit(1);
      }
    }
  }

  console.warn(
    `~~~ ⚠️ Integration tests have two dependencies: a local Wasp-hls build and ffmpeg.
~~~ Make sure you:
~~~ 1.  Have an ffmpeg executable in your path and,
~~~ 2.  You built an up-to-date Wasp-hls bundle through the \`build\` npm script.`,
  );
  console.log();

  if (!browser) {
    console.info("Note: No browser specified, running on " + DEFAULT_BROWSER);
    console.log();
    browser = DEFAULT_BROWSER;
  }

  try {
    await runVitestsWithManagedExit(
      {
        watch: shouldWatch,
        browser,
      },
      filters,
    );
  } catch (err) {
    console.error(`ERROR: ${err}\n`);
    process.exit(1);
  }
}

/**
 * Display through `console.log` an helping message relative to how to run this
 * script.
 */
function displayHelp() {
  console.log(
    `run_integration_tests.mjs: Run the integration test suite.

Usage: node run_integration_tests.mjs [OPTIONS]

Available options:
  -h, --help                          Display this help message.
  -f <FILTER>, --filter <FILTER>      A string that will serve as a filter.
                                      Only test files containing this string will run.
                                      This flag can be set multiple times, in which case
                                      tests containing **either** of those strings will run.
  -b <BROWSER>, --browser <BROWSER>   The browser to run those tests on.
                                      Can be set to either "chrome", "firefox" or "edge".
                                      "chrome" by default.
  -w, --watch                         Re-run tests if any of its depended file has changed.`,
  );
}
