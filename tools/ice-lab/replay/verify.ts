// node replay/verify.ts path/to/edgework-replay.json
import { readFileSync, statSync } from "node:fs";
import { MAX_REPLAY_BYTES, parseReplay, verifyReplay } from "../sim/replay.ts";

try {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw new Error("Usage: node replay/verify.ts <edgework-replay.json>");
  if (statSync(args[0]).size > MAX_REPLAY_BYTES) throw new Error("Replay exceeds the 64 MiB file limit");
  const result = verifyReplay(parseReplay(readFileSync(args[0], "utf8")));
  if (result.divergence) {
    console.error(JSON.stringify({ verified: false, ...result }));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ verified: true, ticks: result.ticks }));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
