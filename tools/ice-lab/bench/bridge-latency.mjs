// tools/ice-lab/bench/bridge-latency.mjs — the host side of the bridge, timed end to end.
//
//   node tools/ice-lab/bench/bridge-latency.mjs [seconds=75] [--json]
//
// Spawns the real games/ice-run-godot/bridge/host.mjs, starts a free skate and
// sends `frame` requests of 2 ticks each, one in flight at a time, as fast as
// the host answers: the clients' own 60 Hz contract with the frame pacing taken
// out, so every number is host work plus the pipe. It reports the round-trip
// distribution, how many requests ran past a 60 Hz and a 120 Hz frame, and the
// reply size in five equal windows, so growth with run length would show.
//
// Needs `node games/ice-run-godot/tools/prepare.mjs --engine-only` first.
//
// This is a measurement of one machine on one day. The numbers are not a claim
// about any other machine, and nothing in the repository gates on them.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, rmSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = join(HERE, "..", "..", "..", "games", "ice-run-godot", "bridge", "host.mjs");
const args = process.argv.slice(2);
const seconds = Number(args.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? 75);
const TICKS = 2, HZ = 120;
const requests = Math.round(seconds * HZ / TICKS);

const dir = mkdtempSync(join(tmpdir(), "ice-bridge-latency-"));
const child = spawn(process.execPath, [HOST, dir], { stdio: ["pipe", "pipe", "inherit"] });
const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
let serial = 0;
async function send(op, options = {}) {
  child.stdin.write(JSON.stringify({ id: ++serial, op, ...options }) + "\n");
  const line = await lines.next();
  if (line.done) throw new Error("the host closed its output");
  const reply = JSON.parse(line.value);
  if (reply.id !== serial || reply.ok !== true) throw new Error(`host refused ${op}: ${line.value.slice(0, 200)}`);
  return { reply, bytes: line.value.length + 1 };
}

const ms = new Float64Array(requests), bytes = new Float64Array(requests);
let restarts = 0;
try {
  await send("hello");
  await send("start", { options: { mode: "free" } });
  // A fixed, varying input from an integer generator: the same run every time.
  let seed = 0x2468ace;
  const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0);
  let controls = {};
  for (let i = 0; i < requests; i++) {
    if (i % 30 === 0) {
      const r = next();
      controls = { kx: ((r % 201) - 100) / 100, knee: 0.2 + ((r >>> 8) % 61) / 100, push: (r >>> 24) % 4 === 0 };
    }
    const t0 = performance.now();
    const { reply, bytes: n } = await send("frame", { ticks: TICKS, controls });
    ms[i] = performance.now() - t0;
    bytes[i] = n;
    if (reply.data.finished) { await send("start", { options: { mode: "free" } }); restarts++; }
  }
} finally {
  child.kill();
  rmSync(dir, { recursive: true, force: true });   // this script's own temporary save directory
}

function dist(values) {
  const v = Float64Array.from(values).sort();
  const at = (q) => v[Math.min(v.length - 1, Math.floor(q * v.length))];
  let sum = 0;
  for (const x of v) sum += x;
  return { mean: sum / v.length, p50: at(0.5), p90: at(0.9), p99: at(0.99), p999: at(0.999), max: v[v.length - 1] };
}
const over = (limit) => ms.reduce((n, x) => n + (x > limit ? 1 : 0), 0);
const windows = [];
for (let w = 0; w < 5; w++) {
  const from = Math.floor(w * requests / 5), to = Math.floor((w + 1) * requests / 5);
  let sum = 0;
  for (let i = from; i < to; i++) sum += bytes[i];
  windows.push(Math.round(sum / (to - from)));
}
const total = ms.reduce((a, b) => a + b, 0);
const report = {
  node: process.version, cpu: cpus()[0]?.model ?? "unknown", cores: cpus().length,
  sim_seconds: seconds, requests, ticks_per_request: TICKS, restarts,
  round_trip_ms: dist(ms),
  over_60hz_frame: { limit_ms: 1000 / 60, count: over(1000 / 60), share: over(1000 / 60) / requests },
  over_120hz_frame: { limit_ms: 1000 / 120, count: over(1000 / 120), share: over(1000 / 120) / requests },
  reply_bytes: dist(bytes), reply_bytes_by_fifth: windows,
  host_ms_per_sim_second: total / seconds, real_time_factor: seconds * 1000 / total,
};

if (args.includes("--json")) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
else {
  const f = (x) => x.toFixed(3);
  const d = report.round_trip_ms, b = report.reply_bytes;
  process.stdout.write([
    `bridge latency — ${report.requests} requests × ${TICKS} ticks (${seconds} s of sim), Node ${report.node}, ${report.cores} × ${report.cpu}`,
    `round trip ms   mean ${f(d.mean)}  p50 ${f(d.p50)}  p90 ${f(d.p90)}  p99 ${f(d.p99)}  p99.9 ${f(d.p999)}  max ${f(d.max)}`,
    `over 16.67 ms   ${report.over_60hz_frame.count} (${(100 * report.over_60hz_frame.share).toFixed(2)}%)   over 8.33 ms   ${report.over_120hz_frame.count} (${(100 * report.over_120hz_frame.share).toFixed(2)}%)`,
    `reply bytes     mean ${Math.round(b.mean)}  p50 ${b.p50}  p99 ${b.p99}  max ${b.max}   by fifth of the run: ${windows.join(", ")}`,
    `host work       ${f(report.host_ms_per_sim_second)} ms per simulated second (${report.real_time_factor.toFixed(1)}× real time)   restarts ${restarts}`,
    "",
  ].join("\n"));
}
