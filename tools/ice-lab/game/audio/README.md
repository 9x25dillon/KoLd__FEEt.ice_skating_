# Game audio — five operator-supplied tracks

`tracks.json` lists five tracks the operator chose for the rhythm layer
(`sim/music.ts`, `musicMode`), each an original recording supplied for this
project — not licensed catalogue music, so bible §5.2's licensing concerns do
not apply to lab use.

Each entry's `bpm` and `offset` (seconds to the first beat) are **estimates**,
not authored beat grids: `aubiotrack` (onset detection, HFC method) found a
raw tempo roughly double what these tracks actually feel like — an octave
error common on syncopated, swung material — so the stored `bpm` is half the
raw detection, landing each track in a slow-ballad 54–68 bpm range. `offset`
is aubiotrack's first detected onset, unadjusted. Bible §5.2's own words:
"let the player correct the grid by hand" — nobody has yet. Treat every
number here as a starting point for the Composer's correction pass, not
ground truth.

| Track | File | bpm (est.) |
| --- | --- | --- |
| Moon Ray Glide | `Moon Ray Glide.mp3` | 54.3 |
| Tongues That Flee | `Tongues That Flee.m4a` | 60.8 |
| 摩擦の水面 (Friction's Water Surface) | `摩擦の水面.mp3` | 67.1 |
| Borrowed Eyes | `Borrowed Eyes.mp3` | 65.8 |
| Moonlit Alibi | `Moonlit Alibi.mp3` | 68.1 |

Playback is presentation-only, same rule as `app/audio.ts`'s procedural
layer: the selected track's `bpm`/`offset`/`beatsPerBar`/`barsPerPhrase`
feed `Params` before a run starts, but nothing about the actual decoded
audio ever reaches `sim/`. A replay records inputs and state, not which
track was playing, so a clip verifies identically regardless of music choice.
