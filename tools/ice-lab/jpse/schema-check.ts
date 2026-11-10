// tools/ice-lab/jpse/schema-check.ts — the JSON Schema subset docs/jpse/schema uses.
//
// The rig has no dependencies, so this checks exactly the keywords the JPSE
// schemas are written in and refuses any other: a schema that grows a keyword
// this does not know fails loudly instead of passing unchecked. Any full JSON
// Schema 2020-12 validator in another language reads the same files.

import { readFileSync } from "node:fs";

type Schema = Record<string, unknown>;

const KNOWN = new Set([
  "$schema", "$id", "$defs", "$ref", "title", "description", "type", "properties", "required",
  "additionalProperties", "items", "minItems", "maxItems", "enum", "const", "anyOf", "minimum", "maximum", "pattern",
]);

export const SCHEMA_DIR = new URL("../../../docs/jpse/schema/", import.meta.url);

const cache = new Map<string, Schema>();
function load(file: string): Schema {
  let s = cache.get(file);
  if (!s) { s = JSON.parse(readFileSync(new URL(file, SCHEMA_DIR), "utf8")) as Schema; cache.set(file, s); }
  return s;
}

function resolve(ref: string, file: string): { schema: Schema; file: string } {
  const [path, frag] = ref.split("#");
  const f = path || file;
  let node: unknown = load(f);
  for (const part of (frag ?? "").split("/").filter(Boolean)) node = (node as Schema)[part];
  if (!node) throw new Error(`unresolved $ref ${ref} from ${file}`);
  return { schema: node as Schema, file: f };
}

function typeOk(t: string, v: unknown): boolean {
  switch (t) {
    case "object": return typeof v === "object" && v !== null && !Array.isArray(v);
    case "array": return Array.isArray(v);
    case "string": return typeof v === "string";
    case "number": return typeof v === "number" && Number.isFinite(v);
    case "integer": return typeof v === "number" && Number.isInteger(v);
    case "boolean": return typeof v === "boolean";
    case "null": return v === null;
    default: throw new Error(`unknown type ${t}`);
  }
}

function check(v: unknown, s: Schema, file: string, path: string, errs: string[]): void {
  for (const k of Object.keys(s)) if (!KNOWN.has(k)) throw new Error(`${file}: keyword ${k} not supported by schema-check`);
  if (typeof s.$ref === "string") { const r = resolve(s.$ref, file); check(v, r.schema, r.file, path, errs); }
  if (s.type !== undefined) {
    const ts = Array.isArray(s.type) ? s.type as string[] : [s.type as string];
    if (!ts.some((t) => typeOk(t, v))) { errs.push(`${path}: expected ${ts.join("|")}`); return; }
  }
  if (s.const !== undefined && v !== s.const) errs.push(`${path}: expected ${JSON.stringify(s.const)}`);
  if (s.enum && !(s.enum as unknown[]).includes(v)) errs.push(`${path}: ${JSON.stringify(v)} not in enum`);
  if (typeof v === "number") {
    if (typeof s.minimum === "number" && v < s.minimum) errs.push(`${path}: below ${s.minimum}`);
    if (typeof s.maximum === "number" && v > s.maximum) errs.push(`${path}: above ${s.maximum}`);
  }
  if (typeof v === "string" && typeof s.pattern === "string" && !new RegExp(s.pattern).test(v)) errs.push(`${path}: ${v} fails ${s.pattern}`);
  if (s.anyOf) {
    // No alternative matches: report the closest one's errors, so a nullable
    // record's real mistake shows rather than "not null either".
    const tries = (s.anyOf as Schema[]).map((alt) => { const e: string[] = []; check(v, alt, file, path, e); return e; });
    if (!tries.some((e) => e.length === 0)) errs.push(...tries.reduce((a, b) => (b.length < a.length ? b : a)));
  }
  if (Array.isArray(v)) {
    if (typeof s.minItems === "number" && v.length < s.minItems) errs.push(`${path}: fewer than ${s.minItems} items`);
    if (typeof s.maxItems === "number" && v.length > s.maxItems) errs.push(`${path}: more than ${s.maxItems} items`);
    if (s.items) v.forEach((x, i) => check(x, s.items as Schema, file, `${path}[${i}]`, errs));
  }
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    const o = v as Record<string, unknown>, props = (s.properties ?? {}) as Record<string, Schema>;
    for (const r of (s.required ?? []) as string[]) if (!(r in o)) errs.push(`${path}.${r}: missing`);
    for (const [k, x] of Object.entries(o)) {
      if (props[k]) check(x, props[k], file, `${path}.${k}`, errs);
      else if (s.additionalProperties === false) errs.push(`${path}.${k}: not in the schema`);
      else if (typeof s.additionalProperties === "object") check(x, s.additionalProperties as Schema, file, `${path}.${k}`, errs);
    }
  }
}

/** Errors validating `value` against docs/jpse/schema/<file>; empty when it conforms. */
export function validate(value: unknown, file: string): string[] {
  const errs: string[] = [];
  check(value, load(file), file, "$", errs);
  return errs;
}
