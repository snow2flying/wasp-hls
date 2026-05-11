/**
 * ============= tasks/index =============
 *
 * Main task runner entrypoint used by npm scripts to build, check, clean, and
 * serve project artifacts.
 */

import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  buildAll,
  buildDocs,
  buildDemoBundle,
  buildMain,
  buildWasm,
  buildWorker,
  generateWasmAbi,
} from "./build.mjs";
import {
  checkAll,
  checkCommon,
  checkDemo,
  checkMain,
  checkRust,
  checkWorker,
} from "./check.mjs";
import { exec } from "../utils/exec.mjs";
import { cleanBuildDirectory } from "../utils/fs.mjs";
import launchStaticServer from "../launch_static_server.mjs";
import { watchDemo } from "./watch.mjs";
import { reportSuccess } from "./report.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rawArgs = process.argv.slice(2);
const normalizedArgs =
  rawArgs.length === 1 && (rawArgs[0] === "--help" || rawArgs[0] === "-h")
    ? ["help"]
    : rawArgs;
const [command = "help", ...rest] = normalizedArgs;

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function run() {
  switch (command) {
    case "build": {
      const { flags, scope } = parseArgs(rest, ["--release", "--watch"]);
      switch (scope ?? "all") {
        case "all":
          assertNoFlag(
            flags,
            "--watch",
            '"--watch" is only supported for "build demo".',
          );
          await buildAll(ROOT, {
            release: flags.has("--release"),
          });
          reportSuccess("Builds");
          return;
        case "demo":
          if (flags.has("--watch")) {
            await watchDemo(ROOT, { release: flags.has("--release") });
          } else {
            await buildDemoFull(ROOT, { release: flags.has("--release") });
          }
          reportSuccess("Demo build");
          return;
        case "wasm":
          assertNoFlag(
            flags,
            "--watch",
            '"--watch" is only supported for "build demo".',
          );
          await buildWasm(ROOT, { release: flags.has("--release") });
          reportSuccess("WASM build");
          return;
        case "worker":
          assertNoFlag(
            flags,
            "--watch",
            '"--watch" is only supported for "build demo".',
          );
          await buildWorker(ROOT, { release: flags.has("--release") });
          reportSuccess("ts-worker build");
          return;
        case "main":
          assertNoFlag(
            flags,
            "--watch",
            '"--watch" is only supported for "build demo".',
          );
          await buildMain(ROOT, { release: flags.has("--release") });
          reportSuccess("ts-main build");
          return;
        case "docs":
          assertNoFlags(flags, 'Flags are not supported for "build docs".');
          await buildDocs(ROOT);
          reportSuccess("documentation build");
          return;
        default:
          throw new Error(`Unknown build scope "${scope}".\n\n${helpText()}`);
      }
    }
    case "check": {
      const { scope } = parseArgs(rest, []);
      switch (scope ?? "all") {
        case "all":
          await checkAll(ROOT);
          reportSuccess("All checks");
          return;
        case "main":
          await generateWasmAbi(ROOT);
          await checkMain(ROOT);
          reportSuccess("ts-main checks");
          return;
        case "worker":
          await generateWasmAbi(ROOT);
          await checkWorker(ROOT);
          reportSuccess("ts-worker checks");
          return;
        case "common":
          await checkCommon(ROOT);
          reportSuccess("ts-common checks");
          return;
        case "demo":
          await checkDemo(ROOT);
          reportSuccess("demo checks");
          return;
        case "rust":
          await checkRust(ROOT);
          reportSuccess("Rust checks");
          return;
        default:
          throw new Error(`Unknown check scope "${scope}".\n\n${helpText()}`);
      }
    }
    case "fmt": {
      const { flags } = parseArgs(rest, ["--check"]);
      if (flags.has("--check")) {
        await exec("cargo", ["fmt", "--check"], { cwd: ROOT });
        await exec("prettier", [".", "--check"], { cwd: ROOT });
        reportSuccess("Code formatting checks");
      } else {
        await exec("cargo", ["fmt"], { cwd: ROOT });
        await exec("prettier", ["--write", ".", "--loglevel", "warn"], {
          cwd: ROOT,
        });
        reportSuccess("Code formatting");
      }
      return;
    }
    case "generate":
      ensureNoArgs(rest);
      await generateWasmAbi(ROOT);
      reportSuccess("WASM ABI code generation");
      return;
    case "clean":
      ensureNoArgs(rest);
      cleanBuildDirectory(join(ROOT, "build"), { preserveDemoBundle: false });
      reportSuccess("Build directory cleanup");
      return;
    case "serve":
      ensureNoArgs(rest);
      await startStaticBuildServer(ROOT);
      return;
    case "start":
      ensureNoArgs(rest);
      {
        const server = await startStaticBuildServer(ROOT);
        try {
          await watchDemo(ROOT, { release: false });
        } finally {
          server.close();
        }
      }
      return;
    case "help":
      ensureNoArgs(rest);
      console.log(helpText());
      return;
    default:
      throw new Error(`Unknown command "${command}".\n\n${helpText()}`);
  }
}

async function buildDemoFull(root, { release }) {
  await generateWasmAbi(root);
  cleanBuildDirectory(join(root, "build"), { preserveDemoBundle: true });
  await buildWasm(root, { release, skipGenerate: true });
  await buildWorker(root, { release });
  await buildDemoBundle(root, { release });
}

async function startStaticBuildServer(root) {
  const server = launchStaticServer(join(ROOT, "build"), {
    verbose: true,
    httpPort: 8000,
    httpsPort: 8443,
    certificatePath: join(root, "localhost.crt"),
    keyPath: join(root, "localhost.key"),
  });

  try {
    await server.listeningPromise;
  } catch (error) {
    server.close();
    throw error;
  }

  return server;
}

function parseArgs(args, allowedFlags) {
  const allowed = new Set(allowedFlags);
  const flags = new Set();
  const positionals = [];
  for (const arg of args) {
    if (arg.startsWith("--")) {
      if (!allowed.has(arg)) {
        throw new Error(`Unsupported flag "${arg}".\n\n${helpText()}`);
      }
      flags.add(arg);
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length > 1) {
    throw new Error(`Too many arguments.\n\n${helpText()}`);
  }
  return { flags, scope: positionals[0] };
}

function ensureNoArgs(args) {
  if (args.length !== 0) {
    throw new Error(`Unexpected arguments.\n\n${helpText()}`);
  }
}

function assertNoFlag(flags, flag, message) {
  if (flags.has(flag)) throw new Error(message);
}

function assertNoFlags(flags, message) {
  if (flags.size !== 0) throw new Error(message);
}

function helpText() {
  return `Usage: node scripts/tasks/index.mjs <command> [scope] [--flags]

Commands
  build [scope] [--release] [--watch]
    all         Build every targets of the player (doesn't include doc and dmeo) (default)
    demo        Build the demo and its runtime dependencies
    wasm        Build only the wasm target
    worker      Build only the worker bundle
    main        Build only the main-thread bundle
    docs        Build the documentation site

  check [scope]
    all         Typecheck and lint the whole TypeScript and Rust codebase (default)
    main        Check main-thread TypeScript
    worker      Check worker TypeScript
    common      Check common TypeScript
    demo        Check demo TypeScript
    rust        Run cargo clippy

  fmt [--check]   Format Rust and JS/TS/Markdown
  generate        Regenerate wasm ABI enums
  clean           Remove build artifacts
  serve           Serve the existing build directory
  start           Serve build/ and watch-rebuild the demo
  help            Print this message`;
}
