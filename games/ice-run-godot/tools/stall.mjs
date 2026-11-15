// games/ice-run-godot/tools/stall.mjs — a bridge host that is late on purpose.
//
// Preloaded into the real host (see stall_node.sh), it holds every Nth reply
// back for a fixed time, the way a busy machine would. It exists to make the
// clients' tick-debt counter fire where it can be watched: a stall longer than
// 100 ms saturates the 12-tick clamp, and the client must count and log the
// sim ticks it discards.
//
//   ICE_STALL_EVERY   hold every Nth reply (default 240)
//   ICE_STALL_MS      for this long (default 250)
//
// It changes when a reply leaves, never what is in it: the solver, the save
// path and every reply byte are the real host's.

const every = Math.max(1, Number(process.env.ICE_STALL_EVERY ?? 240));
const ms = Math.max(0, Number(process.env.ICE_STALL_MS ?? 250));
const nap = new Int32Array(new SharedArrayBuffer(4));
const write = process.stdout.write.bind(process.stdout);
let replies = 0;
process.stdout.write = (chunk, ...rest) => {
  if (++replies % every === 0) Atomics.wait(nap, 0, 0, ms);
  return write(chunk, ...rest);
};
