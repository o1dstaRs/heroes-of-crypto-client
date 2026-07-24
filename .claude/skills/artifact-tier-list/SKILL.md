---
name: artifact-tier-list
description: Generate an interactive HTML artifact tier-list report from Heroes of Crypto a13 self-play. Runs (or reuses) the measure_ai_meta_cohorts simulation to produce win-rate rankings for Tier-1/Tier-2 artifacts across cohorts and terrain maps, then renders a self-contained, filterable HTML report with 95% CI whiskers. Use when the user asks to measure artifacts, (re)generate the artifact tier list, or refresh the artifact meta/balance report.
---

# Artifact Tier-List Report

Two phases: **measure** (slow, optional — only when fresh data is wanted) → **report** (instant).
The report is a single self-contained HTML file, published via the Artifact tool.

## Phase 1 — Measure (optional; reuse an existing summary if one is fine)

The simulation lives in the common package and self-plays `v0.8+a13` mirror matches, bucketing each
artifact's decisive win-rate by cohort and by map.

```
cd game/heroes-of-crypto-common
bun src/simulation/measure_ai_meta_cohorts.ts <games-per-cohort> <seed> <out-dir> <concurrency> <cohorts-csv> <parallel-cohorts>
```

- `games-per-cohort` — **must be divisible by 6** (2 games/matchup × 3 live maps). 10002 ≈ 2.7 h at
  concurrency 9. For a quick refresh use e.g. 600–1200.
- `seed` — fixed base seed (the run is deterministic); the reference run used `85000717`.
- `out-dir` — writes `<out-dir>/ai-meta.summary.json` (+ other artifacts).
- `concurrency` — worker threads (≈ cores − 2). `parallel-cohorts` — cohorts run at once.
- `cohorts-csv` — subset of `ranked-draft,uniform-mixed,ranged-heavy,ground-melee,flyer-heavy,caster-support,cross-archetype`.
  The three general cohorts are `ranked-draft,uniform-mixed,cross-archetype`.

Reference summary already on disk (30,006 fights, 3 general cohorts): `/private/tmp/hoc-aimeta-tier1/ai-meta.summary.json`.
It is slow — confirm with the user before launching a large run; offer to reuse an existing summary.

## Phase 2 — Report (always)

```
bun .claude/skills/artifact-tier-list/scripts/build_report.ts <summary.json> <out.html> \
    [--title="..."] [--policy="..."] [--exploration=0.2]
```

Reads `rankings.artifactsT1` / `artifactsT2` + `provenance` and emits a fully data-driven HTML report:
cohort filter, terrain-map filter, Tier-1/Tier-2 toggle, sortable table, and a 95% Wilson-CI whisker
per artifact centered on 50%. Header (title, fight count, profile, seed, date) comes from the summary.

Then **publish it** with the Artifact tool (favicon ⚔️). To update an existing report in place, republish
the same file path in-session, or pass its URL as `url`.

## What the report shows

- **Cohorts** — the draft/roster populations measured (`all` aggregates them).
- **Maps by terrain** — `Open` (Normal board), `Lava` (lava center), `Mountains` (two destructible
  blocks); `Live` aggregates all three, `all` aggregates everything. Map ids are protocol GridVals
  (1=Open, 2=Water[not live], 3=Lava, 4=Mountains).
- **Win %** is *field-relative*: each fight gives both sides a random artifact of that tier (never
  mirrored, never same roster), so it measures the artifact vs the field of artifacts, not vs "no
  artifact". The field sits a touch under 50% from draws/roster noise — read ranking, lift, and
  whether the CI whisker clears 50%.

## Files

- `scripts/build_report.ts` — summary → self-contained HTML (extraction + template injection).
- `scripts/report_template.html` — the HTML shell (theme-aware, terrain labels, `/*__DATA__*/` marker).

## Regenerating repeatedly

To refresh with new data: rerun Phase 1 to a new out-dir, then Phase 2 on its summary, then republish
the same artifact file path to keep the URL. To just restyle/relabel: edit `report_template.html` and
rerun Phase 2 — no re-measuring needed.
