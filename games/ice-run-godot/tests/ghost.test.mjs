import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {IceEngine} from '../bridge/engine.mjs';
import {TRICKS, GHOST_BESIDE} from '../runtime/game/ghost.js';
import {parseReplay, ReplayPlayer} from '../runtime/sim/replay.js';

function hw(axes = [0, 0, 0, 0], buttons = {}) {
  const b = Array(16).fill(0);
  for (const [k, v] of Object.entries(buttons)) b[Number(k)] = v;
  return {hardware: {axes, buttons: b, keys: [], connected: true}};
}

function host(t, dir) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../bridge/host.mjs', import.meta.url)), dir], {stdio: ['pipe', 'pipe', 'pipe']});
  const lines = createInterface({input: child.stdout})[Symbol.asyncIterator]();
  let serial = 0;
  t.after(() => child.kill());
  return async (op, options = {}) => {
    child.stdin.write(JSON.stringify({id: ++serial, op, ...options}) + '\n');
    const line = await lines.next();
    assert.equal(line.done, false, 'host must respond');
    const reply = JSON.parse(line.value);
    assert.equal(reply.id, serial);
    return reply;
  };
}

test('AI Ghost supports experimental, simulation and diggate in Free Skate using shared game/ghost.ts routines', () => {
  const cases = [
    ['experimental', 'strokes'],
    ['simulation', 'snowplow'],
    ['diggate', 'dig'],
  ];
  for (const [setup, firstTrick] of cases) {
    const engine = new IceEngine();
    engine.configure({setup, ghost: true});
    const startSnap = engine.start({mode: 'free'});
    assert.equal(startSnap.ghostStatus.supported, true, `${setup} supported`);
    assert.equal(startSnap.ghostStatus.active, true, `${setup} active`);
    assert.equal(startSnap.ghostStatus.reason, '');
    assert.ok(startSnap.ghost, `${setup} spawned ghost`);
    assert.equal(startSnap.ghost.id, firstTrick);
    assert.equal(startSnap.ghost.setup, setup);
    const dist = Math.hypot(
      startSnap.ghost.state.pos.x - startSnap.state.pos.x,
      startSnap.ghost.state.pos.y - startSnap.state.pos.y,
    );
    assert.ok(Math.abs(dist - GHOST_BESIDE) < 1e-6, `${setup} spawns beside player (${dist})`);

    let sawPressing = false;
    let snap = startSnap;
    for (let i = 0; i < 60; i++) {
      snap = engine.advance(hw([0.2, 0, 0.2, 0]), 6);
      if (snap.ghost?.pressing) sawPressing = true;
    }
    assert.ok(snap.ghost, `${setup} ghost remains active after 360 ticks`);
    assert.ok(snap.ghost.alpha > 0.5, `${setup} ghost faded in`);
    assert.ok(snap.ghost.t > 2.0, `${setup} ghost clock advanced`);
    assert.ok(sawPressing, `${setup} ghost surfaced live virtual pad pressing words`);
    assert.ok(snap.ghost.how.length > 10, `${setup} ghost surfaced plain-word instructions`);
    assert.ok(snap.ghost.support && Array.isArray(snap.ghost.footPrep), `${setup} ghost exposes IK support and footPrep`);
  }
});

test('AI Ghost handles unsupported Free Skate setups and unsupported modes explicitly with ghost=null', () => {
  for (const setup of ['explorer', 'repertoire', null]) {
    const engine = new IceEngine();
    engine.configure({setup, ghost: true});
    const snap = engine.start({mode: 'free'});
    assert.equal(snap.ghost, null, `setup=${setup} must not spawn mismatched ghost`);
    assert.equal(snap.ghostStatus.enabled, true);
    assert.equal(snap.ghostStatus.supported, false);
    assert.equal(snap.ghostStatus.modeSupported, true);
    assert.equal(snap.ghostStatus.setupSupported, false);
    assert.equal(snap.ghostStatus.active, false);
    assert.match(snap.ghostStatus.reason, /Experimental, Simulation, or Dig Gate/i);
  }

  for (const mode of ['career', 'pairs', 'showcase', 'exhibition', 'composer', 'rookie', 'timed', 'armdrill']) {
    const engine = new IceEngine();
    engine.configure({setup: 'experimental', ghost: true});
    const snap = engine.start({mode});
    assert.equal(snap.ghost, null, `mode=${mode} must keep ghost null`);
    assert.equal(snap.ghostStatus.supported, false);
    assert.equal(snap.ghostStatus.modeSupported, false);
    assert.equal(snap.ghostStatus.active, false);
    assert.match(snap.ghostStatus.reason, /Free Skate and Lessons only/i);
  }
});

test('AI Ghost in Lessons uses tutorialGhost per step and clears on steps without demonstrations', () => {
  const engine = new IceEngine();
  engine.configure({setup: 'experimental', ghost: true});
  const glideSnap = engine.start({mode: 'lesson', course: 'trust'});
  assert.equal(glideSnap.ghostStatus.supported, true);
  assert.equal(glideSnap.ghostStatus.stepHasGhost, false, 'first trust step (glide) has no ghost');
  assert.equal(glideSnap.ghost, null);

  // Skip from glide -> push (which has step.ghost === 'strokes')
  const pushSnap = engine.skipStep();
  assert.equal(pushSnap.ghostStatus.stepHasGhost, true);
  assert.equal(pushSnap.ghostStatus.active, true);
  assert.equal(pushSnap.ghost?.id, 'strokes');

  // Tick through the push step; ghost ticks cleanly
  const ticked = engine.advance(hw([0, 0, 0, 0]), 12);
  assert.equal(ticked.ghost?.id, 'strokes');
  assert.ok(ticked.ghost.t > 0);

  // Disable ghost during lesson -> clears immediately
  const offSnap = engine.setGhost(false);
  assert.equal(offSnap.ghost, null);
  assert.equal(offSnap.ghostStatus.active, false);
});

test('AI Ghost never alters player physical state, scoring, career saves, or replay determinism', () => {
  for (const setup of ['experimental', 'simulation', 'diggate']) {
    const run = (ghostOn) => {
      const e = new IceEngine();
      e.configure({setup, ghost: ghostOn});
      e.start({mode: 'free'});
      for (let i = 0; i < 100; i++) {
        const pushBtn = i % 10 === 0 ? {6: 1} : i % 10 === 5 ? {7: 1} : {};
        e.advance(hw([0.35, 0, 0.35, 0], pushBtn), 6);
      }
      return {
        state: e.state,
        technical: e.technical,
        spinLevel: e.spinLevel,
        career: e.career.serialize(),
        replay: e.exportReplay(),
        ghost: e.snapshot().ghost,
      };
    };

    const off = run(false);
    const on = run(true);
    assert.equal(off.ghost, null);
    assert.ok(on.ghost, `${setup} ghost actually ran during determinism proof`);
    assert.deepEqual(on.state, off.state, `${setup} player SkaterState must be byte-identical`);
    assert.equal(on.technical, off.technical, `${setup} technical score must be identical`);
    assert.equal(on.spinLevel, off.spinLevel, `${setup} spinLevel must be identical`);
    assert.equal(on.career, off.career, `${setup} career state must be identical`);
    assert.equal(on.replay, off.replay, `${setup} exported replay JSON must be byte-identical`);

    // Verify the replay from the ghost-enabled run plays back with zero divergence and ghost disabled
    const clip = parseReplay(on.replay);
    const player = new ReplayPlayer(clip);
    while (!player.done) player.advance();
    assert.equal(player.divergence, null, `${setup} replay must verify cleanly`);

    const playbackEngine = new IceEngine();
    playbackEngine.configure({setup, ghost: true});
    const replaySnap = playbackEngine.replay(on.replay);
    assert.equal(replaySnap.ghost, null, 'ghost must be disabled during replay playback');
    assert.equal(replaySnap.ghostStatus.supported, false);
    assert.match(replaySnap.ghostStatus.reason, /replay playback/i);
  }
});

test('real host supports complete native AI Ghost flow: enable, skate, restart, setup switch, disable, validation', {timeout: 15000}, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ice-ghost-host-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const send = host(t, dir);

  const hello = await send('hello');
  assert.equal(hello.ok, true);
  assert.equal(hello.data.frame.ghost, null, 'fresh native engine starts with ghost off');

  // Supported setup -> enable ghost -> skate
  assert.equal((await send('configure', {options: {setup: 'experimental'}})).ok, true);
  assert.equal((await send('start', {options: {mode: 'free'}})).ok, true);
  const enabled = await send('ghost', {enabled: true});
  assert.equal(enabled.ok, true);
  assert.equal(enabled.data.ghost?.id, 'strokes');
  assert.equal(enabled.data.ghostStatus.active, true);

  let stepReply;
  for (let i = 0; i < 15; i++) {
    stepReply = await send('frame', {ticks: 8, controls: hw([0.3, 0, 0.3, 0])});
    assert.equal(stepReply.ok, true);
  }
  const tBeforeRestart = stepReply.data.ghost.t;
  assert.ok(tBeforeRestart >= 0.9, 'ghost advanced over 120 ticks');

  // Restart -> ghost respawns cleanly at t=0
  const restarted = await send('start', {options: {mode: 'free'}});
  assert.equal(restarted.ok, true);
  assert.equal(restarted.data.ghost?.t, 0);
  assert.equal(restarted.data.ghost?.id, 'strokes');

  // Switch to unsupported setup -> ghost clears with explicit reason
  const unsupported = await send('configure', {options: {setup: 'explorer'}});
  assert.equal(unsupported.ok, true);
  assert.equal(unsupported.data.ghost, null);
  assert.equal(unsupported.data.ghostStatus.supported, false);
  assert.match(unsupported.data.ghostStatus.reason, /Blade Explorer/i);

  // Switch to diggate -> dig ghost spawns cleanly
  const dig = await send('configure', {options: {setup: 'diggate'}});
  assert.equal(dig.ok, true);
  assert.equal(dig.data.ghost?.id, 'dig');

  // Disable ghost -> clears immediately, normal skating continues
  const disabled = await send('ghost', {enabled: false});
  assert.equal(disabled.ok, true);
  assert.equal(disabled.data.ghost, null);
  assert.equal(disabled.data.ghostStatus.enabled, false);
  const normal = await send('frame', {ticks: 6, controls: hw([0.2, 0, 0.2, 0])});
  assert.equal(normal.ok, true);
  assert.equal(normal.data.ghost, null);

  // Invalid ghost payload rejected cleanly without breaking host
  assert.equal((await send('ghost', {enabled: 'yes'})).ok, false);
  assert.equal((await send('configure', {options: {ghost: 1}})).ok, false);
  assert.equal((await send('frame', {ticks: 2, controls: hw()})).ok, true);
  assert.ok(TRICKS.length >= 6);
});
