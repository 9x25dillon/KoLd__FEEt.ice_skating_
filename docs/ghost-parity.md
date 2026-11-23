# EDGEWORK — Native AI Ghost Parity Contract (Milestone D)

**Scope:** Port the existing browser AI Ghost (`tools/ice-lab/game/ghost.ts` + `tutorialGhost` in `tools/ice-lab/game/tutorial.ts`) into the native Godot client (`games/ice-run-godot/`) through the shared Ice Lab bridge without creating a competing solver or decorative replay.

---

## 1. What the Browser AI Ghost Actually Does

Verified directly in `tools/ice-lab/game/ghost.ts`, `tools/ice-lab/game/tutorial.ts`, `tools/ice-lab/game/main.ts`, `tools/ice-lab/game/scene.ts`, and `tools/ice-lab/test/ghost.test.ts`:

1. **Shared Physics, Virtual Controller:** `Ghost` creates a second `SkaterState` on the exact same 120 Hz Ice Lab solver (`step()`), using `setupParams(trick.setup)` and driving a virtual `ControllerHardware` through `setupInput()` with `defaultControllerProfile()`. Nothing it performs is baked animation: every stroke, edge, turn, dig, spin, snowplow, or jump is performed or refused by the solver under the same rules as the player.
2. **Authored Routine Set (`TRICKS`):** Six deterministic routines pinned in `tools/ice-lab/test/ghost.test.ts`:
   - `strokes` (`experimental`, `entry: "stride"`) — Stroking (LT/RT alternating snaps)
   - `dig` (`diggate`, `entry: "stride"`) — Dig (Dig Gate: strokes → RFI>RBO three-turn → LB+RB dig)
   - `loop` (`experimental`, spawn-at-entry `5.25 m/s`) — Backward double loop (known narrow timing window; kept separate from physical double-loop investigation)
   - `snowplow` (`simulation`, `entry: "stride"`) — Snowplow stop (pushes → LB+RB + L3+D-pad left → sticks apart)
   - `spin` (`experimental`, `entry: "stride"`) — Upright spin (strokes → LFO edge → hold Y 3 s → RBO checkout)
   - `three` (`experimental`, `entry: "stride"`) — Three-turn (strokes → LFO edge → tap A → LBI back glide)
3. **Spawning & Lifecycle:**
   - Spawns `GHOST_BESIDE = 2.5 m` to the player's right (or left if `rinkHit(x, y)`), aligned with the player's travel direction.
   - Stride routines match the player's speed (clamped `[GHOST_GLIDE = 1.0, GHOST_TOP = 8.0] m/s`, starting at `1.0 m/s` if standing). Spawn-at-entry routines (`loop`) spawn at their entry velocity (`5.25 m/s`) aligned to the player's travel.
   - Fades in over `0.4 s` (`alpha: 0 → 1`), runs until done / fallen / step `max` exceeded / duration reached, lingers for `GHOST_LINGER = 1.2 s` while fading out (`alpha: 1 → 0`), and respawns beside the player on the next routine (or immediately if it hits the boards).
4. **Tutorial Integration (`tutorialGhost`):** In `lesson` mode, `tutorialGhost(step, ghost, player, on)` shows only the current step's designated `step.ghost` routine on a loop (`push → strokes`, `plow → snowplow`, `dig → dig`, `spin → loop`), and clears the ghost (`null`) on steps without `step.ghost`.
5. **Browser Presentation & Toggle:**
   - Pale icy-cyan translucent figure (`alpha * 0.5`), world-anchored label `GHOST · <trick.name>`, HUD readout (`#ghost-note`: trick name + live `padWords` `pressing` + `how`), and cyan dot on the rink minimap.
   - Toggled with `/` (`KEY_SLASH`) or the Settings checkbox, persisted in `localStorage["edgework-ghost"]`.
   - Hidden during replay playback.

---

## 2. Native Godot Parity Contract

### 2.1 Shared Architecture (Zero Competing Solver)
- `games/ice-run-godot/bridge/engine.mjs` directly imports `Ghost`, `TRICKS` from `../runtime/game/ghost.js` and `tutorialGhost` from `../runtime/game/tutorial.js` (generated from `tools/ice-lab/game/` by `tools/prepare.mjs`).
- `games/ice-run-godot/bridge/host.mjs` exposes `op: "ghost"` (`{enabled: boolean}`) in addition to `configure({options: {ghost: boolean}})`.
- `games/ice-run-godot/scripts/skater.gd` poses the native 3D ghost using the **exact same IK rig** (`Skater.apply_frame()` consuming `frame.ghost.state`, `support`, `footPrep`) with a translucent pale-cyan hologram material override (`TRANSPARENCY_ALPHA_DEPTH_PRE_PASS`, no shadows, no ice-mirror pollution, no snow spray, no contact shadow).

### 2.2 Supported vs. Unsupported Modes & Setups (Explicit Handling)

| Context | Supported? | Native Behavior |
| --- | --- | --- |
| **Free Skate + `experimental`** | **Yes** | Cycles `TRICKS` for Experimental (`strokes`, `loop`, `spin`, `three`). |
| **Free Skate + `simulation`** | **Yes** | Runs `TRICKS` for Simulation (`snowplow`). |
| **Free Skate + `diggate`** | **Yes** | Runs `TRICKS` for Dig Gate (`dig`). |
| **Free Skate + `explorer` / `repertoire` / legacy (`null`)** | **No (explicit)** | `frame.ghost` stays `null`. `frame.ghostStatus` reports `supported: false, setupSupported: false` with a plain-word `reason` naming the supported setups (`Experimental`, `Simulation`, `Dig Gate`). Settings, Pause menu, and the broadcast HUD display this reason clearly when Ghost is enabled. |
| **Lessons (`lesson` mode)** | **Yes (per step)** | Uses `tutorialGhost(lesson.step, ghost, state, enabled)` verbatim. Steps with `step.ghost` loop their matching trick; steps without `step.ghost` report `supported: true, stepHasGhost: false` with `frame.ghost === null`. |
| **Career, Arcade, Exhibition, Showcase, Composer, Pairs, Arm Drill, Rookie, Ice Run** | **No (explicit)** | `frame.ghost` stays `null`; `frame.ghostStatus` reports `supported: false, modeSupported: false, reason: "AI Ghost is available in Free Skate and Lessons only."` |
| **Replay Playback (`player != null`)** | **No (explicit)** | `frame.ghost` stays `null`; `frame.ghostStatus` reports `supported: false, reason: "AI Ghost is disabled during replay playback."` |

*Intentional native refinement vs. browser:* In Free Skate, the browser's `new Ghost(skater)` cycles all 6 `TRICKS` regardless of the player's current setup (showing Experimental pad prompts even on Explorer/Repertoire/Simulation). In native Godot, Free Skate filters `TRICKS` to the player's active setup and explicitly reports unsupported setups (`explorer`, `repertoire`, legacy) so every live pad prompt (`pressing` + `how`) matches the controls the player actually holds.

### 2.3 Strict Isolation & Determinism Invariants
1. `ghost.tick(this.state)` executes strictly **after** player `step()`, `recorder.capture()`, `meter.sample()`, `elements.sample()`, `resolveRinkCollision()`, and `lesson.sample()`.
2. `Ghost` treats `this.state` as read-only and maintains its own isolated `SkaterState`, `Params`, and `GameControlState`. It never writes to player `state`, `ice`, `recorder`, `technical`, `spinLevel`, `career`, `routine`, or `meter`.
3. Running identical inputs with `ghost: false` vs `ghost: true` produces **byte-identical** player `state`, scores, career progression, and `/39` replay JSON (`verifyReplay` passes with zero divergence).
4. Ghost never writes blade traces to `arena.add_traces()` and never ticks while paused, finished, in `ProgramIntro`, or during replay playback.

### 2.4 Controls, HUD Feedback & Persistence
- **Toggle points:**
  1. **Settings** (`AI Ghost: On / Off` button + live setup compatibility note).
  2. **Home Pause menu** during `free` or `lesson` (`AI Ghost: On / Off` button or explicit unsupported-setup note).
  3. **Keyboard shortcut:** `/` (`KEY_SLASH`) during live skating (matches browser `main.ts:408`).
- **Persistence:** Stored as `"ghost": bool` in `user://preferences.json` alongside existing settings (`setup`, `music`, `rumble`, `cruise`). Defaults to `false` on a fresh native profile so automated tests, career sessions, and first-time default `explorer` launches stay uncluttered until opted in; once toggled, persists across restarts.
- **Readable visual feedback:**
  - Translucent icy-cyan 3D athlete (`skater.gd` `set_ghost_mode(true)`) fading cleanly with `ghost.alpha`.
  - World-space billboard `Label3D` (`GHOST · <trick.name>`) floating above the ghost (`y + 2.25 m`), fading with `ghost.alpha`.
  - Top-center PS3-broadcast HUD plate (`broadcast.gd`) showing trick name, setup tag, live virtual pad inputs (`pressing`), and wrapped plain-word instructions (`how`) — plus an explicit top-center notice when enabled on an unsupported Free Skate setup.
  - Pale-cyan dot on the `YOUR LINE` rink navigator (`broadcast.gd`) showing the ghost's live position and heading relative to the player's gold dot.

### 2.5 Lifecycle Verification Matrix
- **Enable → skate:** Spawns beside player, poses via IK, updates live pad words and minimap dot.
- **Pause / resume:** Freezes cleanly on pause, hides HUD/overlay properly, resumes without teleport or state drift.
- **Restart (`R` / `Restart with <Setup>`):** Respawns cleanly beside fresh player start pose with snapped transform.
- **Setup change:** Switching between supported and unsupported setups immediately updates `ghostStatus` and spawns/clears `ghost_skater`.
- **Disable:** Immediately clears `frame.ghost`, hides `ghost_skater` + label + HUD plate, returns to normal skating.
- **Mode exit / scene exit / controller disconnect:** Clears cleanly on switching to unsupported modes or quitting; pauses cleanly on active controller disconnect and resumes cleanly on reconnect.
