// node replay/rebase-fixture.ts [git-rev]
//
// The replay-contract bump recipe (Hand_off.md): after REPLAY_SOLVER moves,
// re-record test/fixtures/replay-v1.json from the fixture at `git-rev`
// (default HEAD). Its params are merged onto the current DEFAULT_PARAMS, so a
// new lever takes its default; every recorded input is replayed through the
// current step(). It then checks what must not move — frame count, every
// scheme, every input — and says which param keys were added. The digests
// are expected to change once the digest's own state grows; the kinematics
// are not, and a mismatch here exits 1 without writing anything.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { DEFAULT_PARAMS, SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { ReplayRecorder, parseReplay, verifyReplay } from "../sim/replay.ts";
import type { Replay } from "../sim/replay.ts";
import type { EdgeEvent } from "../sim/types.ts";

const FIXTURE = "tools/ice-lab/test/fixtures/replay-v1.json";
const rev = process.argv[2] ?? "HEAD";
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
// Raw JSON, not parseReplay: the old clip names a solver this build rejects.
const old = JSON.parse(execFileSync("git", ["show", `${rev}:${FIXTURE}`], { cwd: root, encoding: "utf8" })) as Replay;

let params: Params = { ...DEFAULT_PARAMS, ...old.initial.params };
const s = createState(params, old.initial.speed, old.initial.lean);
const rec = new ReplayRecorder(params, old.initial.speed, old.initial.lean);
for (const frame of old.frames) {
  if (frame.params) params = { ...DEFAULT_PARAMS, ...frame.params };
  const events: EdgeEvent[] = [];
  step(s, frame.input, params, SIM_DT, events);
  rec.capture(frame.input, params, s, events, frame.scheme);
}
const next = parseReplay(rec.toJson());

const problems: string[] = [];
if (next.frames.length !== old.frames.length) problems.push(`frames ${old.frames.length} -> ${next.frames.length}`);
next.frames.forEach((f, i) => {
  if (f.scheme !== old.frames[i]?.scheme) problems.push(`frame ${i} scheme`);
  if (JSON.stringify(f.input) !== JSON.stringify(old.frames[i]?.input)) problems.push(`frame ${i} input`);
});
if (verifyReplay(next).divergence) problems.push("the re-recorded clip does not verify");
if (problems.length) {
  console.error(`Not written: ${problems.slice(0, 10).join("; ")}`);
  process.exit(1);
}
const added = Object.keys(next.initial.params).filter((k) => !(k in old.initial.params));
const removed = Object.keys(old.initial.params).filter((k) => !(k in next.initial.params));
const sameDigests = next.frames.every((f, i) => f.digest === old.frames[i].digest);
writeFileSync(`${root}/${FIXTURE}`, rec.toJson());
console.log(JSON.stringify({
  from: `${rev} (${old.solver})`, to: next.solver, frames: next.frames.length,
  addedParams: added, removedParams: removed, digestsUnchanged: sameDigests,
}));
