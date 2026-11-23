# EDGEWORK — Milestone C Visual & Performance Review (RTX 2080 SUPER, 1080p)

**Branch / Worktree:** `feat/edgework-vertical-slice` (`/home/kill/work/edgework-vertical-slice`, base `origin/main` `e120f21`)  
**Date:** 2026-11-22  
**Status:** Measured on target hardware (RTX 2080 SUPER, 1920×1080 fullscreen). Steady gameplay meets the 60 FPS acceptance budget with large GPU headroom; menu transition stalls were identified, profiled, and reduced by ~10× in `games/ice-run-godot/scripts/main.gd`.

---

## 1. Hardware, Renderer & Capture Configuration

| Parameter | Value |
| --- | --- |
| **GPU** | NVIDIA GeForce RTX 2080 SUPER (8,192 MiB VRAM) |
| **Driver** | NVIDIA `620.73.04` (Vulkan API `1.4.357`) |
| **CPU** | Intel(R) Core(TM) i9-9900K @ 3.60 GHz (8 cores / 16 threads) |
| **Engine & Renderer** | Godot `4.7.2-stable (official)` · Vulkan `forward_plus` |
| **Display Server & Refresh** | X11 (XWayland default) · `1920×1080` fullscreen (`--fullscreen`) · `99.90 Hz` (also verified `100.00 Hz` on native `--display-driver wayland`) |
| **VSync & Frame Cap** | `VSYNC_ENABLED` · `Engine.max_fps = 0` (uncapped beyond VSync) |
| **Viewport / Framebuffer** | Logical viewport `1440×900` (`window/stretch/mode="canvas_items"`), window `1920×1080`, actual GPU framebuffer `2073×1296` (~2.69M pixels, 30% higher pixel count than raw 1080p due to desktop display scaling) |
| **Graphics Features Active** | 4× MSAA (`msaa_3d = 2`), SSAO (`radius 1.2`, `intensity 1.6`), SSIL (`intensity 0.7`), Volumetric Fog + depth Fog, Filmic tonemapping + Glow, 25 roof `SpotLight3D`s (Northlight Arena), 3 `DirectionalLight3D`s, interior box-projected `ReflectionProbe`, live `640×360` planar ice-mirror `SubViewport` (`MSAA_DISABLED`, screen effects off), instanced animated crowd (`86%` Northlight / `90%` Gala), `MultiMesh` blade tracings (up to 18,000 segments) |
| **GPU Isolation & Thermals** | Verified idle before start (`ollama ps` empty, `579 MiB / 8,192 MiB`, `31.7 °C`, `0%` util). Peak VRAM during 5-min run: `1,144.2 MiB` (14%). End temperature after 5-min sustained run: `71.0 °C` (well below the 95 °C thermal alert). |
| **Capture Method** | Repeatable `SceneTree` harness (`bench_1080p.gd`) launching `res://scenes/main.tscn` with isolated `XDG_DATA_HOME` and `--no-relaunch`. Per-frame wall-clock interval (`Time.get_ticks_usec()`), Godot measured render GPU/CPU time (`RenderingServer.viewport_set_measure_render_time(vp_rid, true)`), draw calls, primitives, VRAM, trace count, and `tick_debt` recorded to JSON/CSV. Visual PNG screenshots captured in a separate post-measurement phase so PNG encoding never contaminates frame-time distributions. |

---

## 2. Acceptance Budget Check

Target budget (RTX 2080 SUPER, 1920×1080, sustained 60 FPS):
- **Steady gameplay P99 frame time ≤ 16.7 ms:** **PASS** — `10.73 ms` across 29,994 frames (5-minute baseline) and `10.72 ms` across 6,001 frames (post-polish).
- **No recurring gameplay stalls > 33.3 ms:** **PASS** — 1 isolated non-recurring frame (`89.30 ms` at `t = 146.46 s`, `0.003%` of frames, with `gpu_ms = 3.89 ms`, `cpu_ms = 0.38 ms`) in the 5-minute baseline; `0` frames > 16.7 ms in the 60-second post-polish verification; `0.0` sim ticks dropped by the tick-debt clamp.
- **Loading, shader warm-up, and menu transitions reported separately:** Documented below.

---

## 3. Repeatable 5-Minute Steady Gameplay Workload (Baseline, 29,994 Frames)

Workload structure (5 × 60 s blocks = 300.0 s after warm-up; all 4 cameras cycled every 14.5 s while grounded, never mid-air):
1. **Block 0 (0–60 s):** Free Skate (`experimental`, `outdoor-night` Lakeside rink — string lights, 14 `OmniLight3D`s, pines, stars) — stroking, deep edges, turns, spins, jumps, snow spray.
2. **Block 1 (60–120 s):** Showcase (`simulation` pilot, `gala` venue — 90% crowd + 3 colored wash spotlights) — jumps, spins, crossovers, poses, element cards, live on-screen pad overlay.
3. **Block 2 (120–180 s):** Career Event 0 (`simulation`, `dawn-practice` venue) — real career choreography routine, HUD progression, music clock.
4. **Block 3 (180–240 s):** Exhibition in **Northlight Arena** (`grand-prix` venue — 86% crowd, 25 roof spotlights, full haze/fog/SSAO/SSIL) — jumps, spins, sustained blade trace accumulation (up to 2,921 trace segments).
5. **Block 4 (240–300 s):** Pairs in **Northlight Arena** (`grand-prix` venue, `diggate` setup) — **two** rigged athletes simultaneously plus full arena presentation.

### 3.1 Overall 5-Minute Distribution (29,994 Frames)

| Metric | Min | Mean | P50 | P90 | P95 | P99 | P99.9 | Max | > 16.7 ms | > 33.3 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Wall-clock `dt_ms`** | 3.99 | 10.00 | 10.00 | 10.33 | 10.43 | **10.73** | 11.55 | 89.30 | 5 (0.02%) | 1 (0.003%) |
| **GPU render (`gpu_ms`)** | 3.36 | 4.42 | 4.49 | 5.30 | 5.47 | **5.51** | 5.60 | 8.24 | 0 (0.00%) | 0 (0.00%) |
| **CPU render (`cpu_ms`)** | 0.17 | 0.36 | 0.32 | 0.59 | 0.63 | **0.70** | 0.91 | 1.70 | 0 (0.00%) | 0 (0.00%) |

Peak scene counters across the 5 minutes: `1,179` draw calls, `1,120,644` primitives, `2,921` active blade trace quads, `1,144.2 MiB` VRAM, `0.0` tick debt dropped (`debt_high = 4.0 / 12.0`).

### 3.2 Breakdown by Camera (Wall-Clock `dt_ms`)

| Camera | Frames | Mean FPS | P50 | P95 | P99 | Max | > 16.7 ms | > 33.3 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `0` Tracking | 8,235 | 100.0 | 9.99 ms | 10.42 ms | 10.73 ms | 26.96 ms | 2 (0.02%) | 0 |
| `1` Broadcast | 7,249 | 99.9 | 10.00 ms | 10.44 ms | 10.72 ms | 89.30 ms | 2 (0.03%) | 1 (0.01%) |
| `2` Rink (overhead cutaway) | 7,255 | 100.0 | 10.00 ms | 10.46 ms | 10.73 ms | 21.93 ms | 1 (0.01%) | 0 |
| `3` Blade (low close-up) | 7,255 | 100.0 | 10.00 ms | 10.41 ms | 10.72 ms | 13.27 ms | 0 (0.00%) | 0 |

### 3.3 Breakdown by Venue (Wall-Clock `dt_ms`)

| Venue | Frames | P50 | P95 | P99 | Max | > 16.7 ms | > 33.3 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `grand-prix` (Northlight Arena) | 12,000 | 9.99 ms | 10.44 ms | 10.76 ms | 21.93 ms | 1 (0.01%) | 0 |
| `gala` (Exhibition Gala) | 6,001 | 10.01 ms | 10.41 ms | 10.65 ms | 13.76 ms | 0 (0.00%) | 0 |
| `outdoor-night` (Lakeside Night) | 6,002 | 10.00 ms | 10.44 ms | 10.71 ms | 26.96 ms | 2 (0.03%) | 0 |
| `dawn-practice` (Career Event 0) | 5,991 | 10.00 ms | 10.43 ms | 10.74 ms | 89.30 ms | 2 (0.03%) | 1 (0.02%) |

---

## 4. Loading, Shader Warm-up & First-Use Stutters (Reported Separately)

Players still encounter noticeable one-time cold-start and first-use compilation stutters:

- **Scene load & instantiate (`main.tscn`):** `197.3 ms` (`scene_load_ms = 197.0 ms`, `scene_instantiate_ms = 0.23 ms`).
- **Engine `hello` & initial Vulkan pipeline compile:** `4,795.5 ms` on X11 (`1,955.2 ms` on native Wayland), containing a single `3,284.3 ms` first-frame shader/mesh compilation stall and a `961.2 ms` secondary stall before the opening menu becomes interactive.
- **First gameplay start (`warmup_0`, first run + mirror/audio/outdoor shader activation):** `231.1 ms` wall-clock (`cpu_ms = 75.4 ms`, `gpu_ms = 4.6 ms`).
- **Remaining minor warning in stderr:** `Sub-surface scattering is not supported in viewports with a transparent background. Disabling SSS in transparent viewport.` emitted by Godot when rendering the MakeHuman athlete into `arena.gd`'s transparent `mirror_view` `SubViewport` (harmless visually; planar ice reflection stays intact).

---

## 4a. Cold Start Re-measured and the Boot Screen (2026-11-23)

Measured with `--startup-probe` (engine start → first menu, longest frame before and after it) on the
exported package, RTX 2080 SUPER, each cold run on a brand-new `XDG_DATA_HOME` (no Godot user cache):

| Build | Cold: menu at | Cold: longest frame before menu | Cold: longest frame after menu | Warm: menu at |
|---|---|---|---|---|
| Before (no boot screen) | 11.2–11.6 s (3 runs) | 7.9–8.2 s | 2.9–3.1 s | 2.95 s |
| Shader baker on (non-headless export) | 10.2–10.4 s (3 runs) | 7.5–7.6 s | 3.0–3.7 s | 3.04 s |
| Boot screen (this change), 3 cold + 3 warm | 11.1–12.6 s | 8.0–9.0 s, under the cover | 2.6–3.7 s, under the cover | 2.82–3.05 s |

The total is unchanged, but the player never sees a frozen game: the boot screen's first frame appears at 2.2 s cold
(0.8 s warm) and stays on top until the menu's first frame has drawn. Verified with probe screenshots at frames 2 and 179 after
the menu was built: the cover at frame 2, the menu at frame 179.

What the time is:
- **The Vulkan pipeline cache, not shader translation.** A cold Godot cache with a warm `vulkan/` folder reached the menu
  in 4.3 s; a warm `shader_cache/` with a cold `vulkan/` took 9.5 s. The NVIDIA driver's own disk cache made no measurable
  difference. The pipeline cache is per GPU and driver (`pipelines.forward_plus.<gpu>.cache`, 20 MB here), so it
  cannot ship with the package.
- **The shader baker** (`shader_baker/enabled` in the export preset) needs a GPU at export time; `tools/export.mjs` exports
  `--headless`, where it silently does nothing. Run non-headless it baked 424 steps (+4 MB pck) and saved ~1 s. Not adopted:
  it would make the export depend on a display. Revisit if the export moves to a machine with one.

What changed: `scenes/boot.tscn` (`scripts/boot.gd`) is now the main scene. It draws a 2D title before `main.tscn` loads.
On a first launch it says the ice is being prepared and takes about ten seconds; otherwise "Loading the rink...". The game is
added beside it (not swapped in), and the cover, a `CanvasLayer` at layer 120 that swallows input, is freed two drawn frames after
the bridge's `hello` has built the menu. The marker
`user://pipelines-warm.txt` (GPU name, Vulkan API version and renderer) is written by main.gd once the menu is up, so a new card
or driver shows the first-launch message again. Headless runs skip the wait for a drawn frame.

Still open: the wait itself. Each player pays it once per GPU and driver; only a cache shipped per GPU, or a lighter first
scene, would shorten it.

## 5. Menu Transitions — Bottleneck Identified & Fixed (Before vs. After)

Measuring 23 consecutive menu transitions (`home → career → event → career → settings → controller → settings → atelier → skates → settings → exhibition → creation → showcase → home`, repeated) exposed a severe **CPU-side UI stall** on every single page switch, even while GPU time remained `3.7 ms`:

- **Root cause (confirmed via micro-profiler):** `ThemeDB.fallback_font` (Godot's built-in OpenSans `FontFile`) lacks UI glyphs used extensively in EDGEWORK menus (`→`, `●`, `·`, `♪`, `✓`). On Linux systems with large font libraries (e.g. hundreds of Noto font files under `/usr/share/fonts/noto/`), Godot's `TextServer` invoked `fontconfig` system-fallback scans repeatedly whenever new `Label`/`Button` nodes entered the tree (`925.15 ms` for 50 Unicode labels vs `6.95 ms` for identical ASCII labels — **133× slower**). Every `button()` call also allocated three fresh `StyleBoxFlat` instances and triggered repeated label shaping by setting `text` before `font_size` / `autowrap_mode`.
- **Targeted fix (`games/ice-run-godot/scripts/main.gd`):**
  1. `init_ui_font_fallback()` loads one local sans `FontFile` containing `→` and `●` (e.g. `DejaVu Sans`, falling back cleanly to `Liberation Sans` / `FreeSans` / `Noto Sans Symbols`) once at `_ready()` onto `ThemeDB.fallback_font.fallbacks` (and disables repeated system fallback scans only when both required glyphs are verified in RAM).
  2. `_init_button_styles()` shares 6 prebuilt `StyleBoxFlat` resources across all buttons instead of allocating 3 per button on every rebuild.
  3. `label()`, `paragraph()`, and `button()` configure font/style overrides and `autowrap_mode` **before** assigning `.text`.

### Before vs. After (Same 23 Menu Transitions + 60 s Steady Verification)

| Measurement | Before (`baseline5m`) | After (`after60`) | Change |
| --- | ---: | ---: | ---: |
| **Menu transitions — Max** | `347.16 ms` | **`33.61 ms`** | **10.3× faster** |
| **Menu transitions — P99** | `337.92 ms` | **`33.20 ms`** | **10.2× faster** |
| **Menu transitions — Mean** | `100.00 ms` | **`18.53 ms`** | **5.4× faster** |
| **Menu transitions — P50** | `64.16 ms` | **`15.53 ms`** | **4.1× faster** (under 16.7 ms) |
| **Menu transitions > 33.3 ms** | `18 / 23` (`78.26%`) | **`1 / 23`** (`4.35%`) | **−94% stalls** |
| `home → career` / `event → career` | `332 – 347 ms` | **`31.7 – 33.6 ms`** | **~10.5× faster** |
| `controller → settings` / `career → settings` | `64 – 78 ms` | **`22.1 – 24.7 ms`** | **~3× faster** |
| `settings → home` / `showcase → home` | `31 – 40 ms` | **`10.1 – 10.5 ms`** | **~3.5× faster** (0 dropped frames) |
| **Menu steady (all frames incl. transitions)** | Mean `83.2 FPS`, P99 `64.97 ms` | **Mean `100.0 FPS`, P99 `22.13 ms`** | +16.8 FPS |
| **Steady gameplay (all 5 blocks & 4 cameras)** | P99 `10.73 ms`, GPU P99 `5.51 ms` | **P99 `10.72 ms`, GPU P99 `5.50 ms`, Max `13.17 ms`, `0` frames > 16.7 ms** | Zero regression |

---

## 6. Visual Reference Comparison & Polish

### Provisional Visual Reference
- **Primary Northlight Arena reference:** `docs/presentation/grand-prix-gameplay.png` (classic Northlight Arena gameplay frame showing skater, resurfaced ice, stadium lighting/banners, and the 3-plate PS3-inspired broadcast HUD + rink navigator).
- **Updated MakeHuman Athlete / COIL HUD reference:** `docs/presentation/telemetry/godot-jump-card.png`.

### Comparable Current Captures & Improvements Verified
Compared directly against `docs/presentation/grand-prix-gameplay.png` at 1920×1080 fullscreen (`after60-northlight-tracking.png`, `after60-northlight-broadcast.png`, `after60-northlight-rink.png`, `after60-northlight-blade.png`, `after60-showcase-pad.png`, `after60-menu-home.png`, `after60-menu-settings.png`, `after60-menu-controller.png`):

1. **Athlete & Ice Presentation:** The MakeHuman Athlete (`skater-athlete.glb`) reads substantially cleaner than the older primitive skater in `grand-prix-gameplay.png` — natural shoulder/elbow/knee silhouette, crisp blade contact and continuous tracing line on the ice, legible specular ice reflection, and consistent Northlight Arena lighting across all 4 cameras (`Tracking`, `Broadcast`, `Rink`, `Blade`).
2. **HUD Text Overlap Fixed (`coach_box`):** In `sanity-showcase-pad.png`, long multi-line jump/lesson prompts in `coach_tip` overflowed past `y = 265` and collided with `coach_progress` at `y = 275`. Wrapping `coach_title`, `coach_tip`, and `coach_progress` in a `VBoxContainer` (`coach_box`) eliminated all overlap (`after60-showcase-pad.png`).
3. **Menu Overlay Header Bleed Fixed:** Previously, gameplay top-left `EDGEWORK / GRAND PRIX / FIGURE SKATING` labels remained visible underneath the menu overlay and collided with `"THE GRAND PRIX COLLECTION / 01"`. Hiding `hud_brand` and `hud_edition` while `overlay.visible` is true keeps menu overlays clean (`after60-menu-settings.png`, `after60-menu-home.png`).
4. **Broadcast Clock Legibility Improved:** Added a dark outline (`outline_size = 5`) to top-right `hud_time` so the clock stays readable over the bright white Northlight Arena fascia line (`after60-northlight-tracking.png`).
5. **Controller Focus & Pause CTA Clarity:** High-contrast gold (`#f0d494`) / white (`#ffffff`) focus outlines on buttons/pickers, gold title highlight on focused sliders (`after60-menu-controller.png`), and a single primary gold CTA (`Continue skating →`) when paused from an active run.

### Visual Approximations & Open Items Kept Honest
- Skater movement is driven by the deterministic 120 Hz Ice Lab solver, while upper-body style, facial gaze/blinking, and skirt panel springs (`skater.gd`) are presentation-only approximations.
- Ice reflection uses a `640×360` planar mirror `SubViewport` blended via Fresnel over a single box-projected `ReflectionProbe` (appropriate for the PS3-era broadcast aesthetic; soft at close range).
- During `showcase`, the bottom-left broadcast plate prints the player's currently configured setup label while the computer pilot runs Simulation (existing bridge `snapshot().setup` behavior on `e120f21`).
- Cold-start Vulkan pipeline compilation is now covered by a boot screen (section 4a); the time itself is unchanged and is one-time per GPU and driver.
