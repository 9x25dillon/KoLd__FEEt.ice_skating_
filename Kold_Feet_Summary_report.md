# KoLd__FEEt Session Summary Report

Date: 2026-09-13
Session: UE-REPLAY-01 native replay verification foundation
Branch: `ue-replay-01-foundation`
Commit: `3571cff`
Remote: `origin/ue-replay-01-foundation`

## What today’s session was

Today was a delivery and validation session for the native replay foundation.
The repository was available locally, so the earlier packet’s source-dependent
claims were checked against the actual checkout instead of being accepted at
face value.

The repository’s working solver is now `ice-lab-f64/6`, while the requested
compatibility target is the pinned `/5` solver at commit
`8d89af29caa14ee413e94fc821c76458d8974836`. We preserved that distinction and
generated the native reference material from Git objects at the pinned commit.
The current `/6` Ice Lab code and fixture were left unchanged.

The completed foundation includes:

- Generated `/5` wire value types and field visitors for 93 parameters, 13
  inputs, complete state records, and seven-field events.
- A pinned replay/oracle exporter, wire manifest, SHA-256 manifest, 241 oracle
  rows including tick zero, raw numeric bit maps, and measured mutation data.
- C++17 canonical JSON-profile serialization, ECMAScript number spelling,
  signed-zero normalization, the `turnRadius: "+Infinity"` rule, CRC32, and
  strict floating-point checks.
- Transcribed `/5` deterministic `sin`, `cos`, `tan`, `atan`, `atan2`, `asin`,
  and JavaScript rounding behavior.
- GCC/Clang CMake builds, native checks, reference-integrity tests, compiler
  flag auditing, documentation, and hosted CI wiring.

The native solver, strict native replay importer, oracle reader, runner,
commandlet, Unreal host, and R01–R18 acceptance gates are still incomplete.
The foundation intentionally reports native solver availability as false. A
reference state loaded into C++ is a serialization check; it is not evidence
that a native solver computed that state.

## Evidence recorded today

- Existing Ice Lab suite: 249/249 tests passed when run with permission to
  create Node subprocesses. The sandbox-only run failed because subprocess
  creation returned `EPERM`; no source defect was associated with that failure.
- New reference-integrity tests: 6/6 passed.
- GCC 16.2.1 and Clang 22.1.8 builds passed.
- Each native build checked 15,552 math vectors, 8,201 JavaScript number
  spellings, and 241 reference state/event rows with exact canonical bytes and
  CRCs.
- Byte-for-byte reference regeneration passed.
- TypeScript mutation measurements reproduced the expected tick 5 digest
  mutation and tick 101 brake mutation. The latter was
  `1528175992` versus `2962664100`, with first numeric difference at
  `/0/blade/0/contact/x`.
- The branch was pushed successfully to GitHub.

## Review of today’s work

The strongest part of the work was enforcing the identity boundary between
the current `/6` application and the requested pinned `/5` compatibility
target. The exporter reads the pinned Git objects, runs that solver in a
temporary directory, and records hashes, so the oracle cannot silently be
generated from the newer working tree. The native checks also fail closed on
missing strict-FP evidence and explicitly label reference-state loading as
non-native computation.

The main cost was scope expansion during implementation. The packet described a
large Unreal layer, but the available environment had no Unreal installation.
The practical result was a useful, tested C++ foundation with honest gates,
rather than an apparently complete but unverified commandlet and solver.

## Three short efficiency examples

### Where I could have been more efficient

1. I initially spent time investigating the packet’s Unreal scaffold even
   though the available tools already made a source-derived, UE-free foundation
   the most defensible deliverable.
2. I made an overly broad first patch for the exporter and then corrected its
   generated C++ fixture structure. A smaller vertical slice—export one type,
   compile it, then expand—would have reduced rework.
3. I ran tests inside the restricted sandbox before recognizing that the replay
   test needs Node subprocesses. Starting with the unrestricted validation path
   would have avoided the misleading initial failure.

### Where you could have been more efficient

1. The opening packet was comprehensive but mixed verified facts, assumptions,
   and future implementation text. A short priority statement such as “build
   the best testable UE-free subset, commit it, and push it” would have reduced
   interpretation time.
2. The request to “build and commit what our resources allow” did not initially
   say whether pushing was included. Stating “commit and push the branch” in the
   same instruction would have made the delivery boundary explicit.
3. The packet contained many Unreal details that could not be exercised here.
   Marking the desired output as “foundation now; Unreal work only if the
   environment supports it” would have focused the first pass sooner.

## Prompting improvements

The most useful pattern is to specify an **acceptance contract**: the exact
deliverable, allowed environment, required checks, and what must remain gated.
For example:

> “Using the local checkout only, implement the UE-free `/5` replay foundation.
> Preserve `/6` source. Generate reproducible artifacts from commit X. Run
> GCC and Clang checks, commit, and push. Do not claim Unreal or native solver
> parity.”

Two vocabulary words are especially useful:

- **Acceptance criteria**: the observable conditions that define “done,” such
  as exact test counts, artifact hashes, or a required exit code.
- **Provenance**: where an artifact came from and how its identity is bound,
  such as “oracle generated from pinned commit X, never from the working tree.”

Using those words in future prompts helps separate implementation choices from
the evidence needed to trust the result.

## Next-session starting instructions

Begin in the repository root and confirm the branch and clean tracked state:

```sh
git status --short --branch
git log -1 --oneline
git fetch --all --tags
```

The expected branch is `ue-replay-01-foundation`, tracking
`origin/ue-replay-01-foundation`, at or beyond `3571cff`. Two untracked paths
are intentionally preserved at the repository root:
`E_W_replays_sessions_eng_bld/` and the saved browser page
`Ice Lab — KoLd__FEEt edgework.html`. Do not delete or commit them without an
explicit request.

From `tools/ice-lab`, reproduce the foundation before making changes:

```sh
npm run native:reference
npm run native:test
cmake -S native -B /tmp/kold-native-build -DCMAKE_BUILD_TYPE=Release
cmake --build /tmp/kold-native-build --parallel 2
node native/check-fp-flags.mjs /tmp/kold-native-build/compile_commands.json
ctest --test-dir /tmp/kold-native-build --output-on-failure
node --test test/*.test.ts
```

Run the last command outside a restricted environment if the replay CLI test
gets an `EPERM` subprocess error.

The recommended next implementation order is:

1. Add a strict native JSON reader/importer using `native/reference/wire-manifest.json`.
2. Transcribe `createState`, blade/classification, and the ground solver from
   the pinned `/5` source. Keep the kernel gate false until the transcription
   and independent tests exist.
3. Add the native runner, oracle comparison, first-difference diagnostics,
   parameter-snapshot handling, and completion-state tests.
4. Only after those pass, add the Unreal module, commandlet, report, and
   process-level tests on a pinned UE installation.

Do not relabel the working `/6` solver as `/5`; if the solver source changes,
create a new explicitly named compatibility target and regenerate its artifacts.

## Current status boundary

This session delivered a reproducible native protocol and reference foundation.
It did not deliver native solver parity, Unreal compilation, or any R01–R18
acceptance result. That distinction should remain visible in the next session’s
commits, reports, and prompts.
