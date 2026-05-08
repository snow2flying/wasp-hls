# `wasm` directory

This directory contains the WebAssembly target file when built as well as the
handwritten code, in `./js`, allowing to link it to JavaScript.

Its `./abi` directory contains file useful both for file generation on both
sides (Rust and JavaScript) - such as the creation of synchronized enums - as
well as files used mainly to check that both sides are synchronized.

## Why not just `wasm-bindgen`?

This project initially relied on the Rust "crate" `wasm-bindgen` which takes
care of most of the glue code written manually here.

However, maintainance difficulty arised after updates where it became unclear if
they targeted a stable EcmaScript/DOM version. For this project this is very
important as streaming apps are in a great part specific environments with
sometimes old browser software (smart TVs, game consoles, set-top boxes etc.).

Moreover the idea of ensuring we control the glue code in potentially hot paths
is also a clear advantage.
