# UE-REPLAY-01 — tested foundation, incomplete native verifier

This directory builds an engine-independent C++17 library and tests. It does
**not** implement a native solver, replay importer, runner, report commandlet,
or Unreal project. `KernelAvailable` is false and the native implementation
identity is `kold-native-f64/5-UNTRANSCRIBED`. No native acceptance gate R01–R18
has passed. The original delivery packet is a design input, not compiled code.

The compatibility target is `ice-lab-f64/5`, `edgework-replay/1`, `ground-v1`,
120 Hz, at commit `8d89af29caa14ee413e94fc821c76458d8974836`. The working Ice Lab
has advanced to `/6`; its code and fixture are not replaced or relabelled.

## Build and reproduce

From `tools/ice-lab`, with Node 26, CMake 3.20+, and a C++17 compiler with floating
`std::to_chars` support:

```sh
npm run native:reference
npm run native:test
cmake -S native -B /tmp/kold-native-build -DCMAKE_BUILD_TYPE=Release
cmake --build /tmp/kold-native-build --parallel 2
node native/check-fp-flags.mjs /tmp/kold-native-build/compile_commands.json
ctest --test-dir /tmp/kold-native-build --output-on-failure
```

Use `-DCMAKE_CXX_COMPILER=clang++` in a separate build directory for Clang.
The compile-command audit supports GCC/Clang; MSVC and Unreal are untested.
For MSVC, CMake requests `/fp:strict`, but that is not evidence it was executed.

`npm run native:reference` regenerates artifacts in memory and compares every
byte to the checked-in files. It reads only Git objects at the pinned commit,
extracts their simulation modules to a temporary directory, runs their actual
TypeScript solver, and removes the temporary directory. It never imports the
working `/6` solver. A shallow clone must fetch the pinned history first.

To intentionally regenerate the reviewed artifacts:

```sh
node native/export-reference.mjs native/reference
```

The SHA-256 manifest binds all generated files and records hashes of the pinned
simulation sources. It proves consistency with reviewed Git content, not an
external signature or independent authority. Node's crypto supplies SHA-256;
there is no native SHA-256 implementation yet.

## What is implemented

- Complete generated C++ wire value types and sorted field visitors for all
  pinned interfaces: 93 parameters, 13 inputs, full state including inactive
  jumps/moves, and the seven-field event record. All TypeScript numeric fields
  remain `double`, including enum codes and negative tick sentinels. These are
  semantic values, not packed structs or a binary transport ABI. Value
  initialization is zero initialization, **not** the reference `createState`.
- A source-derived wire manifest and audited import bounds. Replay uses key
  `solver`; initial speed permits −100 through 100; knee, weight and carriage
  permit 0 through 1. Bounds are recorded but no native importer enforces them yet.
- ASCII canonical serialization of `[state, events]`, recursively sorted wire
  keys, ECMAScript number spelling, signed-zero text normalization, the exact
  positive-infinite `turnRadius` exception, and CRC32. Other non-finite values
  fail with a JSON pointer. The writer is limited to the pinned numeric/boolean
  wire profile; it is not a general JSON parser.
- Transcribed `sin`, `cos`, `tan`, `atan`, `atan2`, and `asin`, plus JavaScript
  rounding semantics. Constants and expression order follow the pinned math
  source; range reduction returns local values and asin uses local bit storage.
  These retain the reference's limited large-angle reduction, not a new libm
  accuracy promise. Remaining math/vector helpers and `log` are not transcribed.
- Strict FP compiler options, compile-command audit that fails on missing
  evidence, and a runtime rounding/FMA/subnormal probe. A probe alone cannot
  establish flags across every translation unit.
- Reproducible oracle, raw numeric bits (including signed zero), number and
  math corpora, and measured TypeScript mutations for future native tests.
- Hosted GCC/Clang CI wiring. Its first remote run remains unobserved.

`reference/states.tsv` reloads each reference state and event through the C++
field visitors, then compares exact canonical bytes and CRCs. It duplicates
some oracle data to avoid requiring an unimplemented native JSON reader in the
foundation tests. **Loading a reference state is not computing that state.**
No result here is a native 240-tick replay verification.

## Observed validation, 2026-09-13

On this Linux host, Node 26.8.2:

- Existing Ice Lab suite: **249/249 passed**. Its first sandboxed run failed
  because Node subprocess creation was denied (`EPERM`); the unrestricted run
  passed without source changes.
- Native Release builds: **GCC 16.2.1 and Clang 22.1.8 passed**. Each checks
  **15,552 math vectors**, **8,201 number spellings**, and **241 loaded state/event
  rows**, including the 240 recorded CRCs. Math compares raw bits; NaN cases
  compare classification because NaN payloads are not a replay contract.
- All six reference integrity/FP-audit tests, byte-for-byte regeneration, both
  actual compile-command audits, and the browser build passed.
- TypeScript mutations reproduced tick 5 for a changed frame-4 digest, and
  tick 101 for frame-100 braking: `1528175992` vs `2962664100`, first numeric
  difference `/0/blade/0/contact/x`, `400ae0032097d7a9` vs `400adf91d5812909`.
  These are reference measurements only.

## Remaining work, in dependency order

1. Implement strict native replay/oracle import and validation using the pinned
   field manifest. Keep infrastructure failures distinct from malformed input.
   Decide how digest-only mutations bind an oracle before making the packet's
   `recorded_digest_mismatch` category reachable.
2. Transcribe `createState`, ground solver, blade/classification and necessary
   helpers; preserve inactive jump/move fields, latches, sentinels and event
   order. Audit event capacity from actual emissions. Keep the kernel unavailable
   until this exists and is independently tested.
3. Implement the runner and first-difference diagnostics. Compare computed
   states to the pinned oracle, including tick zero and signed-zero bits; run
   mutation, parameter-snapshot, completion and interleaving tests.
4. Add the UE host/module exports, commandlet, reports, compiler evidence and
   process-level tests on a pinned Unreal installation. Only then evaluate
   R01–R18. No IceField work is included in this foundation.
