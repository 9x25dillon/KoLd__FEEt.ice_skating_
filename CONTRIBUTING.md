# Contributing

This repository is a **design specification with one working instrument in it**.
Most of it is prose that argues for a set of decisions; a small and growing part
of it is code that tests whether those decisions survive contact with a
simulation. Both kinds of contribution are welcome, and they work differently.

Read [`Hand_off.md`](Hand_off.md) first. It is the state of the project in one
file: what exists, what is decided, and the things most likely to trip you up.

---

## The fastest useful contribution: play it and send the session

The whole project rests on one unproven claim — that **analog lean plus analog
knee pressure is a good primary verb**. No shipped game has used it. Everything
else in these thirty months is downstream of that being true.

You can help answer it in ten minutes, in a browser, with a gamepad:

1. Open the Ice Lab (see [`tools/ice-lab/README.md`](tools/ice-lab/README.md)).
2. Skate. Press **M** to change control scheme — they are labelled **A**, **B**
   and **C**, and which is which is deliberately not shown.
3. Press **session.json** and send it, or open an issue with the *Play report*
   template.

What comes out is numbers about a simulation — how long you played, how deep
you leaned, how often the edge let go, how quickly you got up. **No names, no
accounts, no free text, nothing about you.** That is a privacy position and it
is also what makes two people's sessions comparable.

A one-line verbatim is worth more than a paragraph of analysis: *"I could not
make it turn"* and *"I did not want to stop"* are the two most useful things
anyone has ever said about a prototype.

---

## Code and data

`src/`, `data/` and `tools/` are **Apache-2.0**. Contributions to them are
inbound=outbound: what you send is licensed the way the file already is, and
that is the end of it.

Before you send code:

```sh
cd tools/ice-lab
node --test test/*.test.ts     # zero dependencies, about two seconds
node app/build.mjs && node app/serve.mjs
```

Four conventions that are not negotiable, because breaking them costs more than
the change is worth:

1. **`sim/` never imports `app/`.** No DOM, no clock, no `Math.random`. The
   whole rig exists to be transcribed into C++; a solver that has touched a
   renderer cannot be. `test/boundary.test.ts` enforces this by reading the
   actual import statements.
2. **Erasable TypeScript only** — no `enum`, no `namespace`, no constructor
   parameter properties. Node strips the types natively, which is why there is
   no build tooling to install, and strip-only mode refuses anything that would
   need to emit runtime code.
3. **`DEFAULT_PARAMS` stays faithful to the spec, defects included.** The rig's
   value is that it *measures* what the engineering package gets wrong. A new
   parameter's default must reproduce the old behaviour exactly; the fix goes in
   a preset.
4. **Measure, then assert.** Print the number, then write the test around it. A
   test written from a guess only records how generous the guess was. Several in
   here say `MEASURED:` in their name for that reason.

**Scoring is data, never code.** The ISU revises its Scale of Values most
seasons, so every base value, threshold and level feature lives in `data/`. Do
not inline one. See [`data/README.md`](data/README.md).

---

## Documents

`docs/` is **CC BY-NC-ND 4.0** — you may read, share and quote it with
attribution, but not publish modified versions. That is deliberate: the design
bible is the asset, and licensing it permissively would let anyone build and
sell this game from the blueprint.

It also means a pull request that edits `docs/` is a derivative work, so it
needs one extra thing from you.

### The contributor grant

By submitting a contribution to this repository, you agree that:

1. You wrote it, or you have the right to submit it — the terms of the
   [Developer Certificate of Origin 1.1](https://developercertificate.org/),
   which is short and worth the ninety seconds it takes to read.
2. For contributions to `docs/`, you grant the repository owner a perpetual,
   worldwide, non-exclusive, royalty-free, irrevocable licence to use, modify,
   sublicense and distribute your contribution as part of this project,
   including under the project's own CC BY-NC-ND terms and any future licence
   the project adopts. You keep your copyright; this only lets the project use
   what you sent.
3. Contributions to `src/`, `data/` and `tools/` are under Apache-2.0, which
   already includes an express patent grant.

Certify it by signing off your commits:

```sh
git commit -s -m "your message"
```

which appends `Signed-off-by: Your Name <your@email>`. That line *is* the
agreement — there is no separate form to sign.

> This is a common arrangement for a project whose prose and code are licensed
> differently, and it is written to be readable rather than airtight. If a
> contribution ever matters commercially, both sides should want a lawyer to
> look at it.

**Do not relicense anything without asking.** The split is reasoned, and the
reasoning is in [the README](README.md#licensing).

---

## Filing something

| | |
|---|---|
| **Play report** | You skated it. The single most valuable thing here. |
| **Tuning session** | You moved sliders and something got better or worse. Attach the `params.json` — it exports only what differs from `spec`. |
| **Bug** | Include the scheme letter, the preset, and the `session.json` if you have it. |
| **A claim in `docs/` looks wrong** | File an issue rather than a pull request, and quote the line. Corrections to the documents are recorded, not silently applied — [`Hand_off.md` §3.5](Hand_off.md) explains why. |

## Behaviour

Be straightforward and assume good faith. Disagree with the work, not the
person. Anything that would make a first-time contributor feel unwelcome is
worse for the project than whatever point was being made.
