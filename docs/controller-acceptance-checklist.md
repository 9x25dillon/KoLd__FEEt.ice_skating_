# EDGEWORK — Controller Acceptance Checklist (Xbox Elite Series 2)

Status: **Hardware acceptance pending.** Software-level navigation, focus, pause, persistence, and disconnect/reconnect defects were addressed in `games/ice-run-godot/scripts/main.gd`; physical hardware validation must still be performed hands-on with an actual Xbox Elite Series 2 controller.

---

## 1. Environment & Hardware Record (fill in during physical run)

| Field | Value to record |
| --- | --- |
| Date & Git revision | `git rev-parse --short HEAD` |
| Launch target | Source (`npm start`) or Exported binary (`./ice-run.x86_64`) |
| OS & kernel | `uname -a` |
| Connection type | Wired USB-C / Xbox Wireless Adapter / Bluetooth |
| Controller profile slot | Default (profile LEDs off) / Profile 1 / 2 / 3 (note any Xbox Accessories remaps) |
| Exposed button IDs | Capture via `godot4 --path games/ice-run-godot --script res://tools/pad_check.gd -- --out=/tmp/pad-check.jsonl` |
| Selected skating setup | Blade Explorer / Simulation / Experimental / Dig Gate / Full Repertoire |
| Elite paddles setting | Controller's own profile / Footwork / Moves / Game layer |
| Vibration setting | On / Off |

### Reference measurement (2026-11-01, wired Elite 2, default profile, Linux xpad, Godot 4.7.2)

Recorded in `games/ice-run-godot/scripts/pad_map.gd` (re-verify if firmware, kernel, or connection type changes):

- Top-right (`BTN_GRIPR`, `b12`) → `JOY_BUTTON_PADDLE1` → sim button `18`
- Top-left (`BTN_GRIPL`, `b11`) → `JOY_BUTTON_PADDLE2` → sim button `20`
- Bottom-right (`BTN_GRIPR2`, `b14`) → `JOY_BUTTON_PADDLE3` → sim button `19`
- Bottom-left (`BTN_GRIPL2`, `b13`) → `JOY_BUTTON_PADDLE4` → sim button `21`

Note: On Linux with a wired Elite 2 (`vendor_id=1118`, `product_id=2816`), `PadMap.relaunch_for_paddles()` relaunches once with `SDL_GAMECONTROLLERCONFIG` set so paddles expose independently. Bluetooth or stored on-controller profiles behave differently and must be recorded separately.

---

## 2. Explicit Native vs Browser Mapping Contract

| Action | Native Godot (`games/ice-run-godot`) | Browser (`tools/ice-lab/game`) |
| --- | --- | --- |
| Select in menus | `A` (`ui_accept`) | `A` |
| Back / cancel popup | `B` (`ui_cancel` / back) | `B` |
| Navigate menus | D-pad / Left stick | D-pad / Left stick |
| Pause / resume | `Menu` (`Start`) | `Menu` (`Start`) |
| `View` (`Back`) | **Cycles cameras** (Tracking → Broadcast → Rink → Blade); **blocked while airborne** (`jump.phase == 2`) | **Restarts run** |
| Skater movement / setups | Shared 120 Hz Ice Lab solver via `full_hardware` (`setupInput`) | Shared 120 Hz Ice Lab solver (`setupInput`) |

Preserve the native airborne camera-switch block unless an explicit design change is approved.

---

## 3. Full No-Mouse Acceptance Sequence

Run the entire sequence **without touching the mouse or keyboard**. Use an isolated save directory if preserving an active career save.

1. **Launch**
   - [ ] Title overlay opens with clear focus highlight on the first action (`Career / The main game →`).
   - [ ] Controller status footer shows the connected controller name and Elite 2 paddle status (`paddles ready` when wired with default profile).
   - [ ] Pressing `B` or `Menu` on the initial launch screen (before starting a skate) does **not** enter an unconfigured, silent free skate.
   - [ ] No spurious `"Controller profile saved"` toast appears on startup.

2. **Controller Navigation → Free Skate**
   - [ ] Navigate with D-pad to `Exhibition & Free skate →` → `Free skate / Quiet ice` and press `A`.
   - [ ] Gameplay starts cleanly with HUD and audio active; no menu control retains focus.
   - [ ] Press D-pad directions (e.g., bracket/feet) and press `A` repeatedly to push: verify `A` **never** accidentally triggers `Camera · V` or `Menu · Esc`.
   - [ ] Press `View` while gliding: cycles through Tracking → Broadcast → Rink → Blade.
   - [ ] Jump and press `View` mid-air: camera does **not** switch while airborne.

3. **Pause → Setup Change → Settings & Controller Tuning**
   - [ ] Press `Menu` during free skate: gameplay pauses, vibration stops, home menu focuses `Continue skating →`.
   - [ ] Navigate to `Controls, music & assists` (`Settings`).
   - [ ] Change setup (e.g., Blade Explorer → Simulation, or Dig Gate): focus stays on the selected setup button and scroll position does **not** jump back to the top.
   - [ ] Toggle `Controller vibration` Off and On, cycle `Elite paddles`, and open an `OptionButton` picker (`Skater` or `Soundtrack`):
     - [ ] Pressing `B` while the dropdown is open closes **only** the dropdown and keeps you in Settings.
     - [ ] Selecting an item keeps scroll/focus stable.
   - [ ] Open `Controller tuning & bindings`:
     - [ ] Adjust `Stick deadzone` and `Trigger deadzone` with D-pad Left/Right; label highlights while focused and value updates.
     - [ ] Press `Save controller tuning`: saves tuning **without** overwriting your selected setup to Full Repertoire.
     - [ ] Press `B`: returns to `Settings` (not `Home`).
   - [ ] Press `B` from `Settings`: returns to `Home` with changes already persisted to `preferences.json`.
   - [ ] Confirm `Home` shows `Restart with <New Setup> →` beside `Continue skating →`.

4. **Career Routine → Results**
   - [ ] From `Home`, navigate to `Career / The main game →`, open an unlocked event, and press `Skate this program →`.
   - [ ] Complete (or pause/skip warm-up if active) and skate the program to completion.
   - [ ] Confirm Kiss & Cry → Podium → Results sheet renders cleanly.
   - [ ] On a long protocol / results screen, navigate down with D-pad to reach bottom action buttons (`Continue your career →`, `Skate again`, `Return to the rink menu`) with `ScrollContainer` following focus.

5. **Disconnect & Safe Reconnect**
   - [ ] While actively skating, unplug USB (or power off wireless controller).
   - [ ] Verify gameplay immediately pauses, rumble stops, and notice shows `"Controller disconnected — game paused. Reconnect to continue."`
   - [ ] Reconnect the controller.
   - [ ] Verify status updates with controller name, reconnect notice appears, menu focus is restored, and pressing `A` on `Continue skating →` (or `Menu`) resumes skating cleanly with no stuck push/trigger inputs.

6. **Triggers, Paddles, and Vibration**
   - [ ] Verify LT/RT analog range (light bend vs deep knee load vs snap release) and configured trigger deadzone feel.
   - [ ] **Duplicate-button stored profile** (Profile 1–3 on controller): set `Elite paddles: Controller's own profile` and verify paddles act as their mapped buttons.
   - [ ] **Separately exposed paddles** (Default profile, LEDs off, wired USB): verify `Footwork`, `Moves`, and `Game layer` presets in `Simulation` / `Experimental`.
   - [ ] **Vibration On**: verify clean landing vs fall/step-out rumble pulse is felt and stops promptly.
   - [ ] **Vibration Off**: verify zero rumble occurs on landings or falls.

7. **Save and Resume (Persistence Across Relaunch)**
   - [ ] Navigate to `Quit` and exit cleanly.
   - [ ] Relaunch the game.
   - [ ] Open `Settings` and `Controller tuning & bindings`: verify the chosen setup (including `Dig Gate`), `assistance`, `vibration`, `paddles`, `music`, `skater`/`costume`, and `controller_profile` deadzone/sensitivity values all persisted.
   - [ ] Open `Career`: verify earned medals, XP, training weeks, and wear persisted from `career-v1.json`.
