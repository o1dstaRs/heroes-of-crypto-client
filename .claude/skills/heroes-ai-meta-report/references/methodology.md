# AI meta cohort methodology

## Research contract

As of 2026-11-16, new CLI/wrapper runs default to `premium-ranked-v4` and require automatic,
audited SQLite output. Choose `v09-draft-a19-work` for locked V3 draft plus A19 combat;
`a19-work` retains original A19 drafting. Select `--legacy-oracle` explicitly to reproduce the
older outcome-only policy described below. Never relabel historical results or change a running
registered campaign to the new defaults.

Premium studies independently sample all three doctrines (5/6/7 points); only ranked-draft uses
legal sequential drafting. Prescribed-army cohorts bypass it. V3 records six-axis plans including
Empower (783 allocations), committed health and actions, native side geometry, formation evidence,
and sampling probabilities. Ranked artifact choices retain their draft timing; setup sees public
completed rosters but private enemy setup stays hidden. The legacy seven-point/oracle interpretation
below applies only to legacy-oracle archives. Report actual doctrine counts, and do not present
observational coverage or self-play scores as an advisor-strength test.

V4 adds normalized `learning_decision` rows with pre-decision legal observations, complete behavior
probabilities, selected actions (including hidden-pick collisions), and separate outcome labels. The
locked V3 draft anchor gains 20% legal-choice exploration; four deduplicated formation reflections use
the same 80/20 scheme. This changes the collection behavior and must not be called unchanged default
self-play. Formation setup remains explicitly headless, not authoritative-server-qualified. No new split
or ban policy is explored. The training reader filters whole families to training only; historical
snapshots cannot reconstruct missing exploration support. A small 4,032-fight run checks collection
and coverage, not policy strength. Preserve previous production snapshots.

Treat a standard run as seven preregistered cohorts with 150,000 fights per cohort and base seed `85000717`. Use one fixed execution host and its physical performance-core count for the entire run: 12 total workers on the M4 Max or 8 on the 9800X3D. Select and record the exact fight profile on both seats. Current Puffalo defaults use `a19-work`, with H64/complementary R2; the user adopted this policy while accepting the remaining strength uncertainty. Older a13 and R4 summaries retain their original recorded identities. Treat a smoke run as 72 fights per cohort. Run every distinct matchup twice with the complete armies and setups swapping physical seats; therefore 150,000 fights are 75,000 pair clusters and 72 fights are 36 pair clusters.

Keep opposing rosters non-mirrored in both senses:

- Require different roster signatures.
- Require no shared creature identity between the two armies.

Reject the result if either invariant is violated, if an action is rejected, if a raw gzip is corrupt or incomplete, or if the final summary is marked partial.

## Live maps

Use exactly the production map set:

- `1` — Normal
- `3` — Lava Center
- `4` — Block Center

Map `2` (Water Center) is disabled and must not enter a new balance run. Require fights per cohort to be divisible by six: two seat-swapped fights per pair multiplied by three live maps. This makes the map counts exact. Prefer a multiple of 72 whenever changing the standard size because the cross-archetype cohort has 12 ordered archetype matchups across three maps. The 72-fight smoke preset covers each of those 36 cells once.

Historical summaries may contain maps `1/2/3/4`. Inspect or render one only when it has a separate `map: "live"` aggregate or when `--allow-legacy-water` is explicit. Always label Water and the all-simulated aggregate as non-live evidence. Use `map: "live"` for findings whenever that dimension exists; fall back to `map: "all"` only for an older summary without map dimensions.

## Cohorts

Keep cohort names and order stable:

1. `ranked-draft` — current melee-coevolution draft scorer from level offers.
2. `uniform-mixed` — level-balanced sampling from every draftable creature.
3. `ranged-heavy` — armies with two to four ranged stacks.
4. `ground-melee` — no ranged stacks and at least four ground-melee stacks.
5. `flyer-heavy` — at least two flying stacks.
6. `caster-support` — at least two magic or melee-magic stacks.
7. `cross-archetype` — ordered ranged, melee, flyer, and caster matchups with different opposing archetypes.

Reject unknown or duplicate cohort names. A deliberate subset is valid, but record its exact ordered list in provenance and validate only those cohorts.

## Armies, artifacts, and augments

Use the live-sized roster composition `2xL1, 2xL2, 1xL3, 1xL4`. Size every stack with the 1,000-experience budget rule. Use the deployed v0.8-aligned non-fight synergy policy and the seven-point `SEE_NONE` perk. Record the exact policy spec and SHA-256.

Require the pooled live-map unit ranking to include every currently draftable creature. Define draftable exactly as the protocol-backed roster catalog does: the creature has a positive `CreatureVals` protocol ID, a generated `CreatureLevels` value from FIRST through FOURTH, and a valid level and size in `src/configuration/creatures.json`. A protocol `NO_LEVEL` marks runtime-only creatures such as summons. Summon-only creatures are combat products rather than independent roster choices, so their contribution is attributed to the drafted summoner instead of receiving a misleading standalone roster score. Do not maintain a second hand-written validator list; derive roster eligibility from the generated protocol catalog. Numeric per-map slices need not contain every unit in a small run, but the pooled live/default aggregate must.

Select T1, T2, and the complete seven-point augment plan with the contextual research policy after both full rosters and the public map are known. Each component independently uses:

- 80% contextual exploitation.
- 20% uniform randomized exploration.

All selected components stay active together in combat. Use only randomized-exploration assignments for artifact and augment strength rankings. Use the all-policy rows and pick rate to describe what the contextual selector prefers, not to estimate causal strength.

Treat the exact augment plan as the primary causal unit. Individual augment levels are compositional diagnostics because levels coexist inside constrained seven-point plans; do not describe a marginal level ranking as an isolated causal effect.

Track synergies by the exact active key `Faction:choice:level`, where level follows the engine's physical-stack thresholds: 2–3 faction stacks are L1, 4–5 are L2, and 6 are L3. Retain the complete eight-choice by three-level catalog, including zero-support rows, and use only supported rows in comparative views. Synergy selection is deterministic and composition-linked, so interpret its score rate as an associative discriminator in matchups where the exact key appears on only one army. Use `policyScoreRate` for all selected-army outcomes, including same-key matchups. Do not present either value as a randomized causal effect or as a fair head-to-head comparison of the two alternatives within a faction.

## Estimands and uncertainty

Score a win as 1, a draw as 0.5, and a loss as 0. Cluster the two seat-swapped fights at the distinct-matchup level. Compute score rates and 95% intervals over those pair clusters. Keep decisive win rate as a secondary metric.

Interpret unit results as associative roster performance, not isolated treatment effects. Roster construction and unit co-occurrence can explain part of a unit's rate. Compare units within level and across cohorts before proposing balance changes.

Interpret the top point estimate as an observed leader, not a proven unique winner. Confidence intervals may overlap, and selecting the maximum among 96 legal augment plans creates winner's-curse and multiple-comparison risk. Prefer performance tiers and follow-up confirmation runs for close choices.

The artifact oracle is deliberately post-draft research timing. It sees information unavailable at the live T1/T2 pick moments. Use it to study matchup-conditional potential, not as evidence that the same selector can be deployed unchanged in ranked play.

## Output and validation contract

Write each cohort's pair records to `<cohort>.pairs.jsonl.gz`, one distinct matchup per JSONL line. Write `ai-meta.summary.json` only through the cohort runner. A valid completed run must satisfy all of the following:

For Premium, `ai-meta.captured-summary.json` is only the collection checkpoint. The normal summary
stays incomplete until canonical `finalizeAiMetaOutputs` has built `premium.sqlite`, checked SQLite
integrity, audited every raw family, and written `premium-readiness.json` plus a successful
`ai-meta.outputs.json` with file hashes and exact counts. Automatic snapshots are **development**;
candidate admission and production publication are separate. Sharded children set `AI_META_SHARD=1`
and merge before finalization. Never build one snapshot per small shard. An artifact-only failure
can be retried through `ai_meta_outputs.ts` with zero new simulations. Never overwrite a different
snapshot or recover unrecorded evidence by inventing fields.

- `complete` is true.
- Provenance totals equal the sum of cohort totals.
- Games equal twice the pair count.
- Outcomes and end reasons sum to games.
- All live map counters exist, are exactly balanced, and sum to games.
- Rejected actions and both roster-violation counters are zero.
- Every gzip passes decompression/CRC checks and contains exactly one line per pair.
- Ranking keys are unique by cohort, map dimension, and entry key.
- Pooled live rows cover every draftable unit, both artifact tiers, the recorded study's full plan catalog (96 legacy, 273 Premium V1/V2, 783 V3/V4), and augment-level diagnostics. Tiny structural runs may lack unit observations and cannot support rankings.
- Pooled live rows cover all 24 exact synergy choice/level catalog entries, with supported deployed choices clearly distinguished from zero-support alternatives.
- Large runs give every pooled artifact and augment-plan choice randomized-exploration support.
- The standalone report embeds all data and images, exposes the live-map aggregate, includes every draftable unit, and has no external asset dependency.

Capture `commonCommit`, dirty status, a recursive SHA-256 of `src` plus `package.json`, Bun version, platform, architecture, OS release, CPU model, logical CPUs, available parallelism, and memory before workers start. Compare the recorded source fingerprint with current source after the run. A mismatch means the shared worktree changed during or after measurement; preserve and disclose the recorded identity rather than pretending current source is the exact run snapshot. Because a13 search uses wall-clock deadlines, also preserve one host and worker count for every cohort; never merge measurements across hardware or concurrency settings.

## Safe execution

Run commands from `game/heroes-of-crypto-common`; the simulator fingerprints paths relative to that directory. Run the focused cohort and report tests before simulation unless the caller explicitly uses `--skip-tests`.

Use a new or empty output directory. Never resume, overwrite, merge, delete, or clean an existing run. If any stage fails, leave all partial artifacts in place for diagnosis and choose a different output directory for the next attempt.

Validate the completed summary, quality counters, map balance, rankings, enabled-unit coverage, and raw gzip files before rendering HTML. Validate the HTML again after rendering. Never generate a polished report from a partial or unvalidated run.
