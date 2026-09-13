// Apache-2.0. Audit actual GCC/Clang compile commands, not CMake intentions.
import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';

export function checkFlags(commands) {
  assert(Array.isArray(commands) && commands.length, 'empty compile-command evidence');
  const required = new Set(['KoLdMath.cpp', 'KoLdProtocol.cpp', 'native_check.cpp']);
  const seen = new Set();
  for (const row of commands) {
    if (!required.has(basename(row.file))) continue;
    const args = row.arguments ?? row.command.split(/\s+/);
    for (const flag of ['-fno-fast-math', '-ffp-contract=off']) assert(args.includes(flag), row.file + ': missing ' + flag);
    assert(!args.some(a => ['-ffast-math', '-Ofast', '-funsafe-math-optimizations', '-fassociative-math',
      '-ffinite-math-only', '-fno-signed-zeros', '-freciprocal-math', '-fno-trapping-math'].includes(a)
      || (a.startsWith('-ffp-contract=') && a !== '-ffp-contract=off')), row.file + ': conflicting FP flag');
    seen.add(basename(row.file));
  }
  assert.equal(seen.size, required.size, 'missing compile commands: ' + [...required].filter(f => !seen.has(f)).join(', '));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 3, 'Usage: node native/check-fp-flags.mjs <compile_commands.json>');
    checkFlags(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    console.log('Strict FP flags present in all three native translation units.');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
