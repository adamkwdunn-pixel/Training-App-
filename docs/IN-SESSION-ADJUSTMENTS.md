# In-session weight adjustments from RIR

**Tactical vs strategic.** Progression rules (linear, double progression, RIR-guided, …) are the *strategic* layer: after a session they decide next session's weight. In-session adjustments are the *tactical* layer: within today's session, they change the next set's weight so the athlete stays at the prescribed effort. Coaches turn it on or off, and set the largest change between two sets, under **Coach → Progression rules → Within a session**.

## When it runs

- The exercise has an effort target: an RIR, or an RPE (converted as RIR = 10 − RPE). This works with any load type (RIR-based, %, fixed kg) as long as the target is set.
- The athlete has ticked a set with weight, reps and RIR entered.
- It doesn't touch a set where the athlete typed their own weight.

## How much to move the weight

| Principle | Evidence | What the app does |
|---|---|---|
| Each rep closer to or further from failure is worth about 2.5% of 1RM in the 3–12 rep range (≈ 3% of the working weight). | %1RM-to-reps tables: the NSCA load chart (≈ 87% for 5 reps, ≈ 75% for 10), the RIR-based RPE chart (Helms et al. 2016), and the large repetitions-to-failure meta-analysis (952 tests, 269 studies) | Next weight = weight × %1RM(target reps + target RIR) ÷ %1RM(reps done + RIR reported), using the same RPE/RIR chart the app uses for planned loads |
| RIR is typically judged to within about 1 rep near failure, and less accurately further from it (e.g. ≈ 0.8 reps of error at 1 RIR vs ≈ 1.4 at 4 RIR in the back squat). Lifters tend to underestimate how many reps they have left. | Zourdos et al. 2016; Helms et al. 2017; RIR accuracy studies on reps per set | A set within 1 RIR of target, inside the rep range, is "on target" and the weight is kept. Reports of being too easy count as at most 3 RIR over target |
| At a constant load, performance drops from set to set as fatigue builds. | Studies of load reductions over consecutive sets | Increases use ¾ of the calculated change. Decreases use the full amount |
| Practical RPE-based back-off sets use load changes of around 2–6%. | Helms et al. 2018 (RPE-stop back-off sets of 2, 4 and 6%) | A 1-RIR miss moves the bar about 2.5–4%. Every change is capped (10% by default, coach-adjustable) |

The aim for the next set is the reps the athlete just did, kept inside the prescribed range. For "6-10 @ 2 RIR", 12 reps at 2 RIR means go up, and 4 reps means come down. Weights round to the athlete's plate increment. A clear miss always moves the bar at least one plate step, unless that step would be bigger than the cap; this is why a 20 kg dumbbell isn't jumped to 22.5 kg.

**Worked examples** (target 6-10 @ 2 RIR, 100 kg set):

| Logged | Next set |
|---|---|
| 8 @ 2 RIR | 100 kg (on target) |
| 8 @ 1 RIR | 97.5 kg |
| 8 @ 0 RIR | 95 kg |
| 8 @ 3 RIR | 102.5 kg |
| 8 @ 4 RIR | 107.5 kg |
| 12 @ 2 RIR | 107.5 kg (past the top of the range) |
| 4 @ 1 RIR | 90 kg (capped at −10%) |

## How it works with progression rules

- The prescribed weight for next session still comes only from the progression rule.
- Linear and double progression count a session as successful using "all reps completed". This now also requires the reps to be done **at the prescribed weight or heavier**. So when the app had to lighten a session, the rule holds rather than adding load on top of it. If the athlete went heavier, it still counts.
- A new rule metric, **weight vs prescribed (%)**, lets coaches write rules on it, e.g. "if the weight had to drop 5% or more, flag it for me".
- Each adjusted set is saved with the weight the app suggested and the reason. Coaches see this in the session log.

## Sources

- Zourdos MC et al. (2016). Novel resistance training–specific RPE scale measuring repetitions in reserve. *J Strength Cond Res* 30(1).
- Helms ER et al. (2016). Application of the repetitions in reserve-based RPE scale for resistance training. *Strength Cond J* 38(4).
- Helms ER et al. (2017). RPE and velocity relationships for the back squat, bench press and deadlift in powerlifters. *J Strength Cond Res* 31(2).
- Helms ER et al. (2018). RPE as a method of volume autoregulation within a periodized program. *J Strength Cond Res* 32(6).
- Nuzzo JL et al. (2024). Maximal number of repetitions at percentages of the one repetition maximum: a meta-regression and moderator analysis. *Sports Med* 54.
- Studies of RIR rating accuracy at different reps per set (back squat and bench press), and of load reductions over consecutive sets.
- NSCA, *Essentials of Strength Training and Conditioning* — %1RM / repetition load chart.
