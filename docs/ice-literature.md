# Rink ice: what the literature measures

**What two papers measured about skates on rink ice, extracted with page-level care, and what it means
for Ice Lab.**

This is a reference for [open-constants.md](open-constants.md) and for the literature cases in
`data/validation/cases/` (Task 1.2). It is not a review of ice friction. It records what these sources
actually report, separated into three kinds, because the gate treats them differently:

- **Measured.** A number from an experiment, with the paper's own uncertainty.
- **Modelled.** A number from a model run in the paper. It is not a measurement, whatever it agrees with.
- **Secondary.** A number the paper quotes from earlier work. It is traceable, but it has to be checked
  against the primary source before a case built on it counts toward gate coverage
  ([fidelity-gate §2.2](fidelity-gate.md#22--source-types)).

Levels follow [fidelity-gate §2.1](fidelity-gate.md#21--confidence-levels). Nothing below applies to
**figure** skate blades directly. Neither paper measured one, so every transfer to Ice Lab is **L1 at
best**.

Both papers are open access under CC BY 4.0. Numbers are facts and are reproduced here with
attribution. Retrieved and read in full on 2026-09-13.

---

## 1 · The sources

**[LEVER]** Lever JH, Lines AP, Taylor S, Hoch GR, Asenath-Smith E, Sodhi DS (2022). Revisiting
mechanics of ice–skate friction: from experiments at a skating rink to a unified hypothesis. *Journal
of Glaciology* 68(268), 337–356. [doi:10.1017/jog.2021.97](https://doi.org/10.1017/jog.2021.97).
First published online 14 September 2021.
- Kind: a review of friction models, plus rink trials (18 single-skate glide passes: 11 hockey, 7
  short-track speed) with infrared and high-speed imaging, rut profiling and microscopy, plus model runs.
- Citation note: the article's own cite line gives issue **268**. [HUTCHINS] cites it as 68(267)
  with year 2022. The DOI is unambiguous.

**[HUTCHINS]** Hutchins RHS, Wang J, Impellizzeri S (2026). Effect of water quality on ice hardness and
skate-to-ice friction in ice rinks. *Sports Engineering* 29(1), 7.
[doi:10.1007/s12283-025-00538-z](https://doi.org/10.1007/s12283-025-00538-z). PMC12855353.
- Kind: a controlled laboratory rink experiment. Hardness and a static friction index against ice
  surface temperature and dissolved solids in the water.
- Funding includes Jet Ice Ltd., a rink water-treatment company. The authors declare no conflict of
  interest.

**Secondary sources quoted by these papers,** to be pulled before any case relies on them:
- **[DEKONING]** de Koning JJ, de Groot G, van Ingen Schenau GJ (1992). Ice friction during speed skating.
  *Journal of Biomechanics* 25(6), 565–571. doi:10.1016/0021-9290(92)90099-M. Quoted by [LEVER] §2.1.
- **[FEDEROLF]** Federolf PA, Mills R, Nigg B (2008). Ice friction of flared ice hockey skate blades.
  *Journal of Sports Sciences* 26(11), 1201–1208. doi:10.1080/02640410802027360. Quoted by [LEVER] §2.1.
- **[POIRIER-H]** Poirier L, Lozowski EP, Thompson RI (2011). Ice hardness in winter sports. *Cold Regions
  Science and Technology* 67(2), 129–134. Quoted by [HUTCHINS].
- **[POIRIER-G]** Poirier L, Thompson RI, Lozowski EP, Maw S (2011). Getting a grip on ice friction.
  21st ISOPE Conference, vol. 3, 1071–1077. Quoted by [LEVER] for drop-ball hardness. **This is a
  different paper from [POIRIER-H].**
- **[IIHF]** International Ice Hockey Federation (2024). *Official Ice Arena Guide*. Quoted by [HUTCHINS]
  for rink standards.
- **[DU]** Du F, Ke P, Hong P (2023). How ploughing and frictional melting regulate ice-skating friction.
  *Friction* 11, 2036–2058. Quoted by [HUTCHINS] for behaviour above −2 °C.

---

## 2 · Kinetic friction of skates on rink ice: the numbers

These are **sliding** (kinetic) coefficients, μ = F<sub>f</sub> / F<sub>n</sub>, the quantity
`muGlide` stands for.

| Source | Kind | Blade | Conditions | μ |
| --- | --- | --- | --- | --- |
| [DEKONING] via [LEVER] p. 338 | secondary, measured | long-track speed skate, polished | 72 kg skater, normal strides at 8 m/s, indoor and outdoor ice, ice surface −1.8 to −11 °C | straights **0.0046 ± 0.0004**; curves **0.0059 ± 0.0004** (averages over four strides) |
| [FEDEROLF] via [LEVER] p. 338 | secondary, measured | standard hockey: rocker 3.35 m, hollow 12.7 mm | weighted sled, 53 kg per blade, launched at 1.8 m/s, indoor Olympic hockey rink, ice surface −5.7 to −4.9 °C, no chemical additives | **0.0071 ± 0.0005** |
| [LEVER] Table 3, p. 353 | modelled (vertical-skate model after Lozowski and Szilder 2013) | the trial blades, Table 1 | ice surface −5 °C, no blade heat flux | speed skate at 12 m/s 0.0035; speed skate at 2.0 m/s 0.0048; hockey at 4.0 m/s 0.0066 |
| [LEVER] Table 4, p. 353 | modelled | the same | ambient −2.5 °C | hockey: 0.0066 with no blade heat flux; 0.0125 at touch-down; 0.0068 after 2 s of glide |
| [LEVER] Table 4, p. 353 | modelled | the same | ambient −10 °C | hockey: 0.0074; 0.0296 at touch-down; 0.0080 after 2 s |

**Measured kinetic friction on real skates spans about 0.0046 to 0.0071** across two blade types, speeds
from 1.8 to 8 m/s, and ice from −1.8 to −11 °C. **L0** as measurements of those blades. **L1** as a
range for a figure skate, whose blade (hollow-ground, tighter rocker) is closer to the hockey blade
than to the speed skate.

[LEVER] did **not** measure friction in its own trials. Its contribution to the numbers is the model
runs above and the observations in §4.

---

## 3 · What kinetic friction depends on

| Dependence | Evidence | Kind | Level for Ice Lab |
| --- | --- | --- | --- |
| **Speed** | "increased slightly with increasing speed over the range 4.5–10 m s⁻¹" [DEKONING]. "Speed variations over this low-speed range had little effect" for 1.2–2.1 m/s, flared blades only [FEDEROLF]. Both via [LEVER] p. 338. | secondary, measured | **L1**: constant μ is a fair first approximation across skating speeds |
| **Normal load** | "decreased slightly with increasing normal load" [FEDEROLF], with mass varied 32–74 kg on flared blades only | secondary, measured | **L1**: μ independent of load is a fair first approximation |
| **Curve against straight** | 0.0059 against 0.0046, about **+28%** on curves [DEKONING] | secondary, measured | **L2**: direction only. Curves change tilt, load and stroke together, so this cannot be attributed to tilt. |
| **Phase of the stride** | Friction peaks at touch-down and again at push-off, lower and noisy through the glide [DEKONING]. The blade lands on its outside edge, rolls through vertical, and pushes off on its inside edge, confirmed by [LEVER]'s video and rut profiles (p. 347, Fig. 11). | secondary measured; [LEVER] observed | **L1** for the edge sequence of a stride |
| **Blade warm-up** | The model predicts much higher friction at touch-down on a cold blade, settling after about **0.3 s** of glide. The effect is larger in colder air. [LEVER] p. 348, Fig. 12, Table 4 | modelled | **L2**. The paper doubts the model's mechanics while noting it matches measured energetics. |
| **Ice temperature** | **The sources disagree.** [DEKONING]: minimum straight-line friction at −6 to −9 °C, rising at warmer temperatures ([LEVER] p. 338; [HUTCHINS] Discussion). [HUTCHINS]: a *static* index falls steadily as ice warms from −7 to −2 °C (§5). [DU], via [HUTCHINS]: friction can rise sharply above −2 °C. [LEVER]'s model: higher friction on colder ice. | mixed | **Unresolved**. The sign for a figure skate at rink temperatures is not established. |

---

## 4 · The mechanism, and what it means for the model's structure

[LEVER]'s conclusions (pp. 350–354), stated as the paper states them:

- **No blade-wide water film was observed.** Rut temperatures stayed well below 0 °C. The hottest blade–ice
  corner was −0.45 °C for the speed skate and −2.2 °C for the hockey skate, even 0.001–0.01 s after the
  blade passed.
- **Ice fails brittlely under the blade.** Blades shower warm *solid* ice particles, confirmed on
  high-speed video, most to the more heavily weighted side. Ruts are irregular and roughly triangular,
  and blade striations are printed into them, which shows the blade touching the ice directly.
- **The proposed mechanism** is load carried on a few discontinuous **high-pressure zones** through thin
  **ice-rich slurries**. The paper calls this a hypothesis it could not directly confirm.
- **"Ice hardness is not a uniquely defined material property"** (p. 340). Average indentation
  pressure falls with contact area, and depends on indenter geometry and confinement.

**Measured rut geometry** ([LEVER] Table 3, glide passes at 2–4 m/s, ice surface −3.1 to −5.7 °C):

| Blade | Skater | Rut depth | Rut width |
| --- | --- | --- | --- |
| Hockey (rocker 3.35 m, width 3.00 mm, hollow 12.7 mm) | 77 kg | **0.18 ± 0.08 mm** | **4.16 ± 0.47 mm** |
| Short-track speed (rocker 8.0 m, width 1.04 mm, no hollow) | 62 kg | **0.023 ± 0.004 mm** | **1.24 ± 0.69 mm** |

**Pressures quoted in [LEVER]:**
- Pressure melting depresses the melting point by only **−0.074 °C per MPa** near 0 °C (p. 340). **L0.**
- Drop-ball hardness **17.4 MPa at −4.5 °C** ([POIRIER-G], p. 351) and **17.7 MPa at −5 °C** (as used by
  Lozowski and Szilder, p. 342). **Secondary.**
- The pressure-melting point at −5 °C is given as **60 MPa** on p. 342 and as **90 MPa** in the
  Conclusions (p. 354). **These disagree within the paper.** Neither is used here until one is checked
  against the melting-curve reference it cites (Wagner and others, 2011).

### Consequences for the structures in [fidelity-gate §4.2](fidelity-gate.md#42--how-the-solver-relates-these-read-from-the-code)

- **S2, the rigid rocker, ignoring penetration.** Ruts are 0.02–0.3 mm deep, against a rocker radius
  of metres. Ignoring penetration when computing the **trace radius** is supported (**L1**). It says
  nothing about bite.
- **S4, constant μ.** Supported as a first approximation across speed and load (§3, **L1**). Not supported
  on temperature, where the evidence conflicts, or on stride phase, where friction varies within a
  stride. Ice Lab's single `muGlide` is an average-glide value, and should be read as one.
- **S5, the bite law as groove-wall interlock.** Consistent in *kind* with a hollow-ground blade cutting
  a rut about 0.2 mm deep and spalling ice sideways. **No lateral force was measured** by either
  paper, so c<sub>0</sub> and c<sub>1</sub> stay **L3**.
- **`iceHardness` as one scalar.** The paper warns hardness is not a unique property. The scalar is a
  model convenience, and any mapping from a measured hardness onto it is **L3** until a case pins it.

---

## 5 · Rink ice as a material: hardness and static friction

[HUTCHINS] built fresh ice in a laboratory rink and measured it across −2 to −7 °C surface temperature
and three waters.

**Setup, as reported.**
- **Rink:** six sections of 60 × 95 cm; ice 32 mm thick, built in layers of about 0.7 mm; air 9–11 °C
  at 40–50% relative humidity.
- **Temperature:** thermistors frozen into the surface, ±0.03 °C.
- **Water:** Toronto tap water at 220 ppm TDS (control), and reverse-osmosis water at 80 and 5 ppm.
- **Design:** two independent experiments, with sections randomly assigned. Each observation is the mean
  of eight tests, and there were 24 observations per treatment per experiment. The surface was refreshed
  with a heat gun between sets.
- **Friction apparatus:** 41 kg on two hockey blades (26 cm long, 2.85 mm wide, 23 cm apart). A force
  gauge in peak mode recorded the force just before motion, after a 15 s rest. μ<sub>s</sub> = F / (m g).
  Coefficient of variation 3.7%.
- **Analysis:** linear mixed-effects models, value = treatment coefficient + slope × T, with T in °C
  (negative).

### Fitted results ([HUTCHINS] Tables 2 and 3, 95% CI)

| Quantity | 220 ppm | 80 ppm | 5 ppm | Slope per °C | R² marginal / conditional |
| --- | --- | --- | --- | --- | --- |
| **Static friction index** μ<sub>s</sub> | 0.0146 [0.0135, 0.0155] | 0.0132 [0.0122, 0.0143] | 0.0116 [0.0105, 0.0129] | −0.0015 [−0.00165, −0.00132] (text: −0.00149) | 0.78 / 0.80 |
| **Shore D** hardness | 31.05 [30.10, 32.02] | 30.11 [29.05, 31.15] | 27.55 [26.46, 28.61] | −1.54 [−1.70, −1.37] | 0.79 / 0.81 |
| **Leeb C** hardness | 80.06 [72.93, 87.28] | 84.55 [75.92, 93.03] | 68.87 [60.82, 76.97] | −4.37 [−5.77, −2.97] | 0.41 / 0.41 |
| Leeb D hardness | 115.49 | 113.98 | 128.88 | 0.46 [−1.01, 1.98], crosses zero | 0.07 / 0.10, **unreliable per the authors** |

Because T is negative, a negative slope means **colder ice is harder and has a higher static friction
index**.

### Worked values from those fits (arithmetic on the published coefficients, not new data)

| Ice surface | μ<sub>s</sub> 220 / 80 / 5 ppm | Shore D 220 / 80 / 5 ppm |
| --- | --- | --- |
| −2 °C | 0.0176 / 0.0162 / 0.0146 | 34.1 / 33.2 / 30.6 |
| −5 °C | 0.0221 / 0.0207 / 0.0191 | 38.8 / 37.8 / 35.3 |
| −7 °C | 0.0251 / 0.0237 / 0.0221 | 41.8 / 40.9 / 38.3 |

### How to read it for Ice Lab

- **This is not a gliding friction coefficient.** At −5 °C the static index (about 0.022) is roughly
  **three times** the measured kinetic μ of hockey blades at the same ice temperature (0.0071, §2). The
  authors call it an index and argue static and kinetic friction co-vary. The co-variation they fit uses
  ice-on-ice data from Bowden and Tabor, not skates. **Only relative sensitivities transfer, at L2.**
- **Relative sensitivities** at −5 °C on 220 ppm ice:
  - about **6.7% of μ<sub>s</sub> per °C**;
  - **220 → 80 ppm** lowers μ<sub>s</sub> by about the same as warming 0.9 °C;
  - **80 → 5 ppm** by about 1.1 °C;
  - **220 → 5 ppm** by about 2 °C.
  
  The paper's headline, that "effects [are] comparable to a 1 °C increase", refers to each step.
- **Hardness:** 80 and 220 ppm ice are indistinguishable (overlapping CI). **5 ppm ice is softer** by
  about 3.5 Shore D, the same as about 2.3 °C of warming.
- **Scope:** a laboratory rink with fresh, heat-gun-smoothed ice, static contact, hockey blades, −2 to
  −7 °C. The authors state the relationship may not hold outside that range.
- **Section-to-section variation was small:** conditional R² exceeds marginal by only 0.02–0.03. That is
  a property of a fresh laboratory surface. **It says nothing about variation across a real rink's ice.**

---

## 6 · Rink environment standards

As quoted by [HUTCHINS]. **Secondary**, and these are guidelines, not measurements.

| Parameter | Guideline | Source as quoted |
| --- | --- | --- |
| Ice surface temperature | −4.5 to −5.5 °C "excellent"; −5.6 to −6 °C "good"; below −6.5 °C "minimum acceptable" | [IIHF] |
| Air temperature and humidity | 9–11 °C, 40–50% RH | [IIHF] |
| Ice thickness | 32 mm | [IIHF] |
| Water TDS | < 80 ppm "excellent"; 120 ppm the minimum-quality cutoff | [IIHF] |
| Water TDS, NHL practice | 80–100 ppm | Snow (2023), via [HUTCHINS] |
| Refrigeration per area | community rinks (12 in Quebec) 162–204 W/m²; recommended for international competition 170–227 W/m² | NRCan (2013) and [IIHF], via [HUTCHINS] |

- **These are hockey standards.** Neither paper gives figure-skating ice guidelines. They are a starting
  frame, not a figure-skating specification.
- **Refrigeration capacity per area overlaps** between community rinks and the international
  recommendation. So whatever makes a local rink's ice differ from an event rink's is **not shown by
  these figures to be cooling capacity per square metre**. It could be operation, water, maintenance,
  slab condition or use, none of which these papers measured.

---

## 7 · What this means for Ice Lab's constants

Each item names the entry in [open-constants.md](open-constants.md).

- **`muGlide` = 0.006.** Inside the measured 0.0046–0.0071 range for real skates (§2). That range is now
  a **recorded plausible range with a basis** (L1 for figure skates). The value is not changed: no
  failing case asks for it. It is still L2 until a case at figure-skate conditions passes.
- **`muEdgeGain` = 0.6.** Directional support only: curves cost about 28% more for speed skaters, but
  tilt is confounded with load and stroke (§3). Unchanged, L2.
- **`airDensity` = 1.29 kg/m³.** That is dry air at **0 °C**. The [IIHF] air guideline of 9–11 °C gives
  about **1.24–1.25 kg/m³** at sea level for dry air (ideal gas, L0 arithmetic on a secondary
  guideline). The model's drag is therefore probably **about 3% high** for an indoor rink held to that
  guideline. This is an entry in §11 of the register and changes only with a physical source, which
  this is. **It is not changed here**, because it changes solver arithmetic, and so the replay contract,
  and it should land as its own commit with the test and replay consequences measured.
- **`iceHardness`, `sharpness`.** Scalars with no physical unit. Shore D gives a way to **measure** a
  rink (§5). Mapping Shore D onto the scalar has no case behind it (L3). Not done.
- **`biteC0`, `biteC1`.** Unchanged, L3. No lateral force data in either paper.
- **`muSkid` = 0.35.** Unaddressed by either paper.
- **Temperature dependence.** Ice Lab has none. **Do not add one yet.** The sign of the effect on
  *kinetic* friction for a figure skate at rink temperatures is contested between the sources (§3).

---

## 8 · A rink-environment parameter set: proposal, not built

These papers make a set of **rink conditions** measurable and citable. They do not yet make them
**modellable** for figure skates. The proposal keeps those two steps apart.

**Step 1: record now, in every case (Task 1.2 schema).**

| Field | Unit | Why it is recordable | Model effect today |
| --- | --- | --- | --- |
| `ice_surface_temp_c` | °C | The standard rink control variable; [IIHF] bands | none |
| `air_temp_c`, `air_rh_pct` | °C, % | [IIHF] guideline; gives air density | `airDensity` input ([gate §3](fidelity-gate.md#3--the-configuration-under-test) exception) |
| `water_tds_ppm` | ppm | Rinks log it; [HUTCHINS] shows it matters | none |
| `ice_hardness_shore_d` | HD | Portable, nondestructive, the best-behaved instrument in [HUTCHINS] | none |
| `minutes_since_resurface` | min | Neither paper measures it; the bible models wear by it | none |
| `venue_type` | community / training / competition | Separates the populations the owner asked about | none |
| `rink_location`, `travel_direction` | zone, bearing | Surface slope and local wear (glide cases must run both ways) | none |

**Step 2: model only what a case can test.** A field moves from "recorded" to "in the solver" only when:
1. literature gives the **sign and rough size** of its effect on a kinetic quantity for a comparable
   blade, and
2. at least one case shows the model **failing without it**. Under
   [gate §7.3](fidelity-gate.md#73--structural-failures-falsify), that failure is structural and is the
   licence to add the dependence.

Today, only **air temperature**, through air density, meets condition 1. **Ice temperature** fails it on
sign. **TDS** and **hardness** have static-index evidence only.

---

## 9 · Candidate literature cases for Task 1.2

Each is a **stub** until its primary source is read. Values here are what the secondary quote says, and
are **not** to be entered as `expected` until checked.

- **`glide-hockey-sled-federolf2008`** — O4 `glide_decel_ms2`. Expected μ g ≈ 0.070 m/s² on a
  non-stroking, near-vertical blade at about 1.8 m/s, with u<sub>m</sub> from ±0.0005 on μ. Caveats:
  a sled on two blades, not a skater, so the case must compare **blade friction only**, with the
  model's drag at that speed subtracted or shown negligible. Hockey blade, transfer L1.
  - *2026-09-22, sourced from the abstract (fidelity-gate §2.2).* **Correction:** the abstract says
    three test blades, not two. It confirms 1.8 m/s, 53 kg per blade and μ 0.0071 (s = 0.0005); rocker,
    hollow and ice temperature remain secondary. The model's drag is not negligible here (about 18% of
    the stand-in's deceleration), so the case shows the verdict both ways instead: 0.0720 m/s² with drag,
    0.0589 without, both within the 0.0181 tolerance of 0.0697. Passes.
- **`glide-speedskate-straight-dekoning1992`** — O4, straight-line μ 0.0046 ± 0.0004 at 8 m/s.
  Caveats: speed-skate blade, a stride average rather than a glide, drag dominant at 8 m/s. Likely
  `unmodelled` for a figure-skate blade. Recorded so it is not re-derived.
- **`air-time-isolated-jumps-bruening2018`** — O5 `air_time_s`, *added 2026-09-22*. Bruening et al. 2018
  (PLoS One, open access, read in full): video flight time 0.44 ± 0.060 s over 59 isolated jumps, mostly
  axels and doubles, 7 skaters Juvenile to Senior. One-sided, `at_least`. The model flies 0.592 s on the
  corpus's existing jump script: a pass, and about 2.5 SD above this population's mean, which only
  footage of specific jumps can judge. The same paper's in-air peak rotation (1,273 deg/s doubles,
  1,465 triples, no spread) has no gate observable yet.
- **`glide-curve-ratio-dekoning1992`** — curve against straight μ, about 1.28. An L2 directional check
  on `muEdgeGain`. Likely stays unsourced for figure skates.
- **`rut-depth-hockey-lever2022`** — rut depth 0.18 ± 0.08 mm, width 4.16 ± 0.47 mm, primary
  ([LEVER] Table 3). **No current observable.** Ice Lab does not model penetration. Recorded for the
  tracing renderer and for any future ice-state grid.

---

## 10 · What neither paper answers

- **Figure skate blades.** Not measured by either paper: no friction, rut or bite data. The design bible
  gives a figure blade 1.1 mm wide with a ½-inch (12.7 mm) hollow (§3.2). That width matches the
  long-track speed-skate width [LEVER] quotes, and is **worth checking against a real figure blade**
  before any rut or bite reasoning depends on it.
- **Lateral holding force**, the edge's bite. Nothing measured.
- **Kinetic friction against ice temperature for a figure skate**, at −2 to −7 °C. Contested.
- **Variation across a real rink's surface**: slope, thickness, soft zones, the dished middle the owner
  asked about. Not measured. [HUTCHINS]'s small section effects come from a fresh laboratory surface.
- **Wear between resurfaces.** Not measured.
- **The toe pick.** Not addressed.
