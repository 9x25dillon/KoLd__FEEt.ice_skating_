# EDGEWORK / Grand Prix — Linux Distribution & Release Preparation

This document covers packaging, runtime prerequisites, save locations, troubleshooting, upgrade/rollback, asset provenance, unresolved distribution questions, and release gates for the native Linux Godot client (`games/ice-run-godot/`).

> **Release posture:** EDGEWORK is an active development build, **not** a finished or physically validated release. Historical and pending acceptance gates are tracked separately in §8.

---

## 1. Prerequisites

### Build prerequisites (to create or refresh the Linux package)

| Dependency | Version / Requirement | Notes |
| --- | --- | --- |
| Node.js | **24.19+ or 26** (CI tests Node 24 & 26) | Runs `tools/prepare.mjs` (uses `node:module` `stripTypeScriptTypes`) and `tools/export.mjs`. No `npm install` required. |
| Godot 4 | **4.7.2** (tested) + matching Linux export templates | Set `GODOT_BIN` if the binary is not on `PATH` as `godot4`. Export templates must be installed for `--export-release Linux`. |
| FFmpeg | Any build with `libvorbis` | Needed by `tools/prepare.mjs` (without `--engine-only`) to convert the 5 music tracks to `.ogg`. |
| GPU / OS | Linux x86_64 | Godot Forward+ renderer (Vulkan). Blender is only required if modifying `.blend` athlete sources. |

### Runtime prerequisites (to play the exported Linux package)

| Dependency | Requirement | Notes |
| --- | --- | --- |
| Node.js | **24.19+ or 26** on `PATH` (or via `ICE_RUN_NODE`) | **Not bundled** inside the export. Required to execute `bridge/host.mjs` and the 120 Hz `runtime/` solver. |
| GPU | Vulkan-capable GPU (Godot 4 Forward+) | Compatibility/low-end OpenGL-only GPUs are not targeted. |
| Adjacent package files | `ice-run.x86_64`, `ice-run.pck`, `bridge/`, `runtime/` | Must stay in the same directory. Godot, FFmpeg, and Blender are **not** required to play. |
| Network | None | Fully local; no network service or account required. |

---

## 2. Package Layout, Version Manifest, and Checksums

Build command (from repository root, after all source edits are finished):

```sh
npm run build:native
```

Output directory: `games/ice-run-godot/exports/linux/` (git-ignored build artifact).

Expected files:

```text
exports/linux/
├── ice-run.x86_64               # Godot Linux x86_64 executable
├── ice-run.pck                  # Packed Godot scenes, scripts, shaders, generated models & audio
├── bridge/
│   ├── engine.mjs               # Native engine adapter around prepared Ice Lab modules
│   └── host.mjs                 # JSON-over-stdio process launched by engine_link.gd
├── runtime/                     # Prepared JS mirror of tools/ice-lab/{sim,app,game,game/motion} + data/
│   ├── package.json
│   ├── source-manifest.json     # SHA-256 of every source TypeScript module prepared
│   ├── tracks.json
│   ├── data/
│   └── {sim,app,game}/
├── package-manifest.json        # Versioned package provenance (edgework-linux-package/1)
├── SHA256SUMS                   # SHA-256 checksums for every shipped file
├── README.txt                   # Quick-start user instructions
├── LICENSE / LICENSE-CODE / LICENSE-font.txt
└── docs/                        # Build notes, audio notes, MakeHuman CC0 provenance, distribution & controller docs
```

### Verify package integrity before shipping or launching

```sh
cd games/ice-run-godot/exports/linux
sha256sum -c SHA256SUMS
```

Every line must report `OK`. `package-manifest.json` records the exact Git commit SHA, branch, dirty flag, UTC build timestamp, build Node version, Godot version, prepared module count, and `source-manifest.json` digest.

---

## 3. Save Locations & Compatibility

### Live player save directory (Linux)

Godot stores player data in `OS.get_user_data_dir()`, which resolves on Linux (project name `EDGEWORK · Ice Run`) to:

```text
~/.local/share/godot/app_userdata/EDGEWORK · Ice Run/
```

Files written there:

| File | Owner | Contents |
| --- | --- | --- |
| `preferences.json` | `scripts/main.gd` | Skating setup (`simulation`/`explorer`/`experimental`/`diggate`/`repertoire`), assistance, steadying hand, dance style, controller profile, track, free-skate profile, character, costume, skates, cruise, AI ghost toggle (`ghost`), music, rumble, paddle layout, Composer sequence. |
| `career-v1.json` | `bridge/host.mjs` | Career progression: medals, XP, stats, training weeks, rust, wear, injuries, arm focus/bests, custom event plans, music timelines, event dance styles, career skater sheet, style mastery. |
| `career-v1-before-<timestamp>.json` | `bridge/host.mjs` | Automatic dated backup written whenever the player begins a new career; previous career is never overwritten. |
| `wardrobe-v1.json` | `bridge/host.mjs` | Atelier custom costume designs (slots). |
| `studio-v1.json` | `bridge/host.mjs` | Creation shelves (created skaters, saved programs, dance sequences). |
| `arcade-v1.json` | `bridge/host.mjs` | Arcade high-score board. |
| `ice-run-replay.json` | `bridge/host.mjs` | Last exported performance replay (`/39` format or `edgework-pairs/1`). |
| `session-metrics.json` | `bridge/host.mjs` | Last exported session telemetry summary. |

### Isolated saves for smoke tests and captures

Passing `-- --smoke-test` or `-- --capture` automatically redirects saves to:

```text
~/.local/share/godot/app_userdata/EDGEWORK · Ice Run/test-runs/<pid>/
```

and disables writing `preferences.json`, keeping player saves untouched.

### Compatibility notes

- `bridge/host.mjs` writes save files atomically (`*.tmp` + `renameSync`).
- Older `career-v1.json` files lacking newer optional fields (`armFocus`, `armBest`, `dances`, `style`, `wear`, etc.) fall back to safe defaults inside `CareerState.restore()`.
- Older `preferences.json` files lacking `skates`, `steady`, `danceStyle`, or `diggate` remain loadable without losing earlier settings.
- Replay format stays pinned at `/39`; presentation or packaging updates must never alter solver replay digests.

---

## 4. Launch, Troubleshooting, Upgrade, and Rollback

### Launch

```sh
cd /path/to/edgework-linux
./ice-run.x86_64
```

If Node 24.19+ / 26 is installed outside default `PATH` (for example via `nvm`, `fnm`, or `volta`):

```sh
# bash / sh
ICE_RUN_NODE=/absolute/path/to/node ./ice-run.x86_64

# fish
env ICE_RUN_NODE=/absolute/path/to/node ./ice-run.x86_64
```

### Troubleshooting common startup errors

| Symptom / Startup error | Cause | Fix |
| --- | --- | --- |
| `Ice Lab exited before answering ["hello"] … Could not create child process: <path>` or `Could not launch Node (...)` | `node` is not on `PATH`, `ICE_RUN_NODE` points to a missing/non-executable binary, Node is too old (< 24.19), or a file in `runtime/` is corrupt. (On Linux, `OS.execute_with_pipe` spawns a child process that reports the exec error on stderr before exiting.) | Install Node.js 24.19+ or 26 (check `node -v`), set `ICE_RUN_NODE` to its absolute path, and verify `sha256sum -c SHA256SUMS`. |
| `Missing bridge file (...)` or `Missing simulation runtime file (...)` | `ice-run.x86_64` was moved without its adjacent `bridge/` or `runtime/` directory (or `tools/prepare.mjs` was not run in a source checkout). | Keep `ice-run.x86_64`, `ice-run.pck`, `bridge/`, and `runtime/` together; in source checkouts run `node games/ice-run-godot/tools/prepare.mjs`. |
| Wired Xbox Elite Series 2 paddles not detected | SDL's default Linux mapping omits Elite 2 back paddles unless `SDL_GAMECONTROLLERCONFIG` is set at process launch. | Use the controller's default profile (profile LEDs off). On launch `PadMap.relaunch_for_paddles()` relaunches once with the mapping set. |
| Black screen or Vulkan startup failure | GPU/driver lacks Vulkan support required by Godot Forward+. | Verify Vulkan drivers (`vulkaninfo --summary`); Forward+ does not fall back to Compatibility on desktop. |

### Upgrade procedure

1. Back up `~/.local/share/godot/app_userdata/EDGEWORK · Ice Run/` before replacing a working build.
2. Extract the new release into a **new versioned directory** (e.g., `edgework-<short-sha>/`) rather than overwriting the previous build in place.
3. Run `sha256sum -c SHA256SUMS` inside the new directory.
4. Run an isolated smoke test first:
   ```sh
   ./ice-run.x86_64 --headless -- --smoke-test
   ```
5. Launch interactively and confirm saves load cleanly.

### Rollback procedure

1. Close the new executable.
2. Restore the backed-up save directory if you want pre-upgrade career/preferences state (`cp -a <backup> ~/.local/share/godot/app_userdata/"EDGEWORK · Ice Run"/`).
3. Launch the previous versioned directory's `./ice-run.x86_64` (kept side by side).
4. In source development, roll back a delivery branch with a standard revert commit or by switching back to the last verified `origin/main` tag/commit (never force-push or reset shared history).

---

## 5. Asset Provenance

| Asset / Subsystem | Source & Authoring Pipeline | License / Status |
| --- | --- | --- |
| 120 Hz skating simulation & gameplay logic (`tools/ice-lab/`) | Repo-authored TypeScript; prepared to `runtime/*.js` via `tools/prepare.mjs` with SHA-256 `source-manifest.json`. | Project code license (`LICENSE-CODE`); design bible & world (`LICENSE`, CC BY-NC-ND). |
| Default Athlete & Rival anatomy/skins/hair (`assets/source/makehuman/`) | MakeHuman CC0 system assets (`hm08` base mesh, targets, MH2 CC0 skins/eyes/hair); built by `tools/build_athlete.py` and `tools/build_spectator.py`. No MakeHuman AGPL code used. | CC0 1.0 (`assets/source/makehuman/README.md`). |
| Competition Athlete, Violet, Berserker models (`assets/source/skater-*.blend`) | Repo-authored Blender sources & Python builders (`build_competition_skater.py`, `build_skater.py`, `build_berserker.py`). | Project assets (`LICENSE`). |
| Arena, shaders, procedural audio, HUD (`scripts/`, `shaders/`) | Repo-native GDScript and GDShader; procedural blade/crowd/landing audio and procedural reflections/skirt flutter (approximations, not mocap/cloth/recorded crowd). | Project code/assets. |
| Music tracks (`tools/ice-lab/game/audio/`, converted to `.ogg`) | Five operator-supplied original recordings (`Moon Ray Glide`, `Tongues That Flee`, `摩擦の水面`, `Borrowed Eyes`, `Moonlit Alibi`). BPM/offset are `aubiotrack` estimates. | Operator-supplied; verify distribution rights & beat grids before public release. |
| Title & UI fonts (`assets/fonts/`) | Bitstream Vera / DejaVu / Arev derived font (`assets/fonts/LICENSE`). | Permissive Bitstream Vera / Public Domain (retain `LICENSE-font.txt`). |
| ISU scoring tables (`data/*.csv`, `data/*.json`) | Transcribed from published sport regulations for interoperability. | Facts not copyrightable; must be verified against current ISU publications before content lock. |

---

## 6. Unresolved Distribution Questions

1. **Node.js bundling:** Should future Linux releases bundle a pinned Node 24/26 runtime (or ship an AppImage/Flatpak wrapper) so players do not need a matching system Node install?
2. **Additional platforms:** Windows and macOS exports are not configured or tested yet.
3. **Exported package testing in CI:** `.github/workflows/ice-lab-checks.yml` runs Ice Lab, Godot bridge (`prepare.mjs --engine-only`), Unreal bridge contract, fidelity gate, and README status checks on Ubuntu Node 24/26, but has no Godot binary, so `--smoke-test`, `--capture`, and `npm run build:native` currently run locally only.
4. **Trademark & legal review:** Protecting the name "Edgework" and confirming public redistribution rights for the five operator-supplied audio tracks remain open before any public release.
5. **Beat-grid authoring:** `tools/ice-lab/game/audio/tracks.json` still uses unverified `aubiotrack` estimates.
6. **Hardware/FPS bar:** Target resolution, GPU baseline, and sustained frame-time percentile targets (Milestone C) have not yet been formally agreed with the owner.

---

## 7. Validation Sequence (when authorized to execute checks)

Run in strict dependency order from the worktree root:

```sh
# 1. Prepare bridge runtime from final TypeScript sources
node games/ice-run-godot/tools/prepare.mjs --engine-only

# 2. Simulation & replay checks
(cd tools/ice-lab && node --test test/*.test.ts && node replay/verify.ts test/fixtures/replay-v1.json)

# 3. Godot bridge/host & Unreal contract checks
node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
node --test games/ice-run-unreal/tests/*.test.mjs

# 4. Godot source smoke test (isolated saves)
godot4 --headless --path games/ice-run-godot -- --smoke-test

# 5. Export Linux package (requires Godot 4.7.2 + Linux export templates + FFmpeg)
npm run build:native

# 6. Validate exported artifact independently (checksums + isolated smoke test)
(cd games/ice-run-godot/exports/linux && sha256sum -c SHA256SUMS && ./ice-run.x86_64 --headless -- --smoke-test)
```

---

## 8. Release Readiness Checklist

### Completed in this slice (code/docs written on `feat/edgework-vertical-slice`, base `e120f21`)

- [x] Verified authoritative delivery source (`grand-prix-presentation` merged in PR #52 `6154e62`; `origin/main` at `e120f21`, PR #132) and created isolated worktree `/home/kill/work/edgework-vertical-slice`.
- [x] Fixed concrete native controller-flow defects in `games/ice-run-godot/scripts/main.gd` (focus isolation from top-right HUD buttons, launch-screen unconfigured resume guard, settings/controller persistence including `diggate`, non-destructive controller tuning save, popup-safe `B` back routing, scroll/focus preservation, high-contrast focus visibility, disconnect/reconnect notices & vibration cleanup).
- [x] Added immediate startup file/Node diagnostics and early-exit stderr reporting in `games/ice-run-godot/scripts/engine_link.gd`.
- [x] Added versioned `package-manifest.json`, `SHA256SUMS`, MakeHuman CC0 provenance copy, and updated `README.txt` to `games/ice-run-godot/tools/export.mjs`.
- [x] Documented reproducible Xbox Elite Series 2 hardware checklist (`docs/controller-acceptance-checklist.md`) and Linux distribution/rollback guide (`docs/distribution-linux.md`).

### Known historical / open defects (inherited, not claimed resolved)

- [ ] **Physical double-loop landing remains unresolved** (replay contract `/39` unfinished; `/40` canonicalization separate; do not disguise with parameter tweaks).
- [ ] **Fidelity / test baseline:** On `origin/main` (`e120f21`), recorded Nov 20 counts are Ice Lab `1148` (`1147 pass`, `1 todo`: discretisation floor), Godot bridge `78/78`, Unreal `9 + 2 skipped` (superseding the older Sept 27 8-failure baseline from `0392bf0`). Not yet re-executed on this branch.

### Pending gates (must pass before release readiness can be claimed)

- [ ] **Automated checks on `feat/edgework-vertical-slice`:** Pending owner authorization (standing build-forward rule: test suites not run in this turn).
- [ ] **Source & exported Linux artifact smoke tests:** Pending Godot 4.7.2 execution + Linux export templates verification (`npm run build:native`, `sha256sum -c SHA256SUMS`, exported `--smoke-test`).
- [ ] **Physical Xbox Elite Series 2 acceptance:** Pending hands-on run against `docs/controller-acceptance-checklist.md` (USB/Bluetooth, trigger ranges, dead zones, paddles, vibration, disconnect/reconnect).
- [ ] **Visual & performance acceptance (Milestone C):** Pending agreed reference screenshot, hardware/resolution/FPS target, gameplay captures, and frame-time percentile measurements.
- [ ] **Workstream selection (Milestone D vs F):** Pending owner decision on next native feature increment (note: Dig Gate and Tutorial/Lessons are already in native `origin/main`; AI Ghost remains browser-only) vs independent physics investigation.
