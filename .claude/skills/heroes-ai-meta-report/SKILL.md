---
name: heroes-ai-meta-report
description: Run, validate, analyze, or regenerate Heroes of Crypto non-mirrored AI meta cohorts and standalone image-rich HTML reports ranking units, exact active synergies, Tier-1/Tier-2 artifacts, exact augment plans, augment levels, cohorts, and maps. Use for balance/meta cohort requests, 150k-fight studies, smoke runs, alternate seeds or cohort subsets, report regeneration from ai-meta.summary.json, output validation, and cross-cohort or cross-map comparisons. Do not use for mirrored AI-version tournaments, local browser E2E matches, generic gameplay debugging, or direct balance-stat edits.
---

# Heroes of Crypto AI Meta Report

Run the common-engine cohort pipeline and return a validated, self-contained HTML report. Commands below are relative to this skill directory; from the repository root use `.claude/skills/heroes-ai-meta-report/scripts/run-ai-meta.sh`. Do not start the game server; this workflow does not need it.

New batches also **require a validated Premium SQLite snapshot**.

For current ranked decisions use `ranked-current-a19-work` / `premium-ranked-current-v1`. This imports the sibling server (or `HOC_SERVER_LOC`) against the same common source, persists all three draft override budgets, and uses native public Setup and final Board formations/barrels. Freeze both source trees and dependency manifests. Its deterministic policy observations and per-fight purchases are distinct from historical V4 exploratory data; never merge populations. Only ranked-draft exercises picking; prescribed cohorts still use synthetic armies/artifacts. Native opening parity is not a whole live deadline or ranked-server combat qualification. Doctrine W/D/L and all nine matchups are in the canonical report; `army_fight` and `setup_payoff` retain actual per-seat purchases and observed practical use. The canonical CLI defaults to
`premium-ranked-v4` learning capture (explicit historical v1/v2/v3 remain supported) and builds `premium.sqlite`, `premium-readiness.json`, and
`ai-meta.outputs.json` before publishing a complete summary. Use `v09-draft-a19-work` for the
user-selected locked V3 draft + A19 combat, or explicitly choose `a19-work` for original A19 drafting.
Snapshots are development artifacts, never automatically published or promoted. Outcome-only oracle
research requires `--legacy-oracle`; do not omit capture merely because a run is small or sharded.
V4 explores legal hybrid draft alternatives and four formation reflections, preserving decision-time observations and full marginal probabilities in `learning_decision`. It remains headless setup, explicitly not authoritative-server qualified; no split/ban exploration or automatic learned policy.
Historical results keep their recorded policy. Old completed outcome-only batches cannot acquire
missing observations by simply converting their summaries to SQLite.

## Choose the operation

- Run a full research study with `scripts/run-ai-meta.sh run [options]`.
- On many-core hosts, prefer `scripts/run-ai-meta.sh run-sharded --processes N --window 12 [run options]`. It runs each pair window in its own single-worker Bun process, then merges, validates and renders exactly like `run`. The shards are kept in `<out>.shards`. One Bun process with many Worker threads stalls on a runtime lock: 24 threads on puffalo ran at ~35% CPU each and 0.55 fights/s, while 24 separate processes ran at ~2 fights/s. Use `--bun-dir` to pick a runtime; Puffalo now uses Bun 1.4.5 in `$HOME/.bun/bin`. `--workers-per-process N` enables a fixed worker pool in each process. Prefer the installed `hoc-a19-meta` command there: it reads the published common runtime config and defaults to six processes × four workers, GC markers 2, nice 10, and current `a19-work` (H64/complementary R2). `hoc-a19-fights` selects the same new default; the frozen R4 reference requires `--reference-r4`. The user accepted the R2 strength uncertainty; do not describe it as proven non-inferior.
- Use `--fight-profile a19-work` for host-independent balance runs. It uses the same sealed a19 genome, environment and strategy with `searchOfflineDeterministicWork`, so every move gets the full search budget and records reproduce exactly on any host or process count. Plain `a19` keeps the live 175 ms deadline, so a loaded host silently truncates the search and then weakens the AI.
- Exercise the whole pipeline without making balance claims with `scripts/run-ai-meta.sh smoke [options]`.
- Validate and summarize an existing run with `scripts/run-ai-meta.sh inspect SUMMARY`.
- Regenerate HTML without rerunning fights with `scripts/run-ai-meta.sh render SUMMARY [--report REPORT]`.
- Modify the simulator and its tests first if the user requests a new cohort, fight version, selection policy, or exploration rate. These are source constants, not wrapper options.

Read [references/methodology.md](references/methodology.md) before interpreting results, comparing runs, changing cohort code, or reporting category leaders.

## Run the workflow

1. Resolve the client repository. Let the wrapper discover it from the current directory, or pass `--client-root PATH`/set `HOC_CLIENT_DIR`.
2. Preserve shared-main changes. Inspect status, but never clean, revert, stage, or commit unrelated files.
3. Choose a fresh output directory for a new study. New canonical runs checkpoint each completed pair with hashes and fixed input/source identity. For an interrupted registered run, `AI_META_RESUME=1` with the exact original CLI arguments resumes only missing indexes; active/foreign locks, changed sources and corrupt records are rejected. Shard retries use this automatically. Do not apply this to old directories without `collection-registration.json`, or change hypotheses on resume. A partially computed pair may repeat; a durable complete pair must not.
4. Require games per cohort to be positive and divisible by 6 for exact three-map/seat balance. A 72-fight smoke completes one 12-cross-archetype-by-3-map pair cycle. Use 150,000 for inference and 72 only for structural smoke testing.
5. Use physical performance cores, not SMT threads: 12 workers on the M4 Max or 8 on the 9800X3D, with the wrapper's one-cohort-at-a-time default. On puffalo (Xeon w7-3545, 24 physical cores), use `run-sharded`: a maximum of 24 total fight workers. The current default is six Bun processes with four workers each; run `hoc-a19-meta --dry-run` to verify the published source and exact configuration. Historical 40-process timings below predate this default and are not a current concurrency recommendation. Measured 2026-09-13 at 1,008 fights per cohort on the old r2/s3 budget: a19 ran at ~2.0 fights/s with 24 processes; a19-work ran at ~1.5 fights/s with 40 processes, about 80 minutes for 7,056 fights. Since common f892870 (2026-09-20) the production profile runs the deep budget (rollouts 4 / shortlist 6 / max melee 10), and a19-work measured ~0.53 fights/s with 40 processes: 3 h 42 min for 7,056 fights. Calibrate on the final host, then freeze the host, worker count, and committed source for the whole study. The a13 175 ms decision and 275 ms circuit deadlines make actions sensitive to CPU speed and contention, so never merge cohorts measured on different hosts or worker counts. The runner checks source identity before every cohort wave and preserves a partial run instead of mixing changed source. Those are historical R4 measurements. Current a19-work uses the user-adopted complementary R2 profile; measure current throughput on the final source instead of reusing the old ETA.
6. Run the wrapper. It executes focused tests unless explicitly skipped, invokes the positional runner from `game/heroes-of-crypto-common`, builds and audits SQLite, validates the completed summary and raw gzip files, then writes `ai-meta-report.html`. Sharded children set `AI_META_SHARD=1`; the merger calls the same canonical finalizer once for the complete bank. Run the canonical `ai_meta_outputs.ts --preflight PROFILE` before expensive work. A stale remote wrapper/common checkout must be updated before a new run; do not alter an already running frozen study.
7. Keep long runs attached and poll them. Send a concise progress update at least once per minute while actively collaborating; v0.8+a13 changes the historical two-hour runtime estimate substantially.
8. Preserve a failed or incomplete directory. If only snapshot construction failed, retry `bun src/simulation/ai_meta_outputs.ts RUN/ai-meta.captured-summary.json RUN/ai-meta.summary.json` from its common root; this audits/reuses matching artifacts and runs zero fights. Do not rerun an expensive batch to repair an artifact-only failure. A failed simulation uses explicit same-registration missing-pair recovery as above; preserve the original failure log.
9. Open or browser-check the final HTML when browser tooling is available. Confirm desktop/mobile layout, decoded images, functional cohort and map selectors, charts, search, and no page/console errors.

## Require these acceptance checks

- Require `complete: true`, the exact unique cohort set, expected games and pairs, and consistent provenance totals.
- Unless explicitly `--legacy-oracle`, require a successful `ai-meta.outputs.json`, its matching `premium.sqlite` and `premium-readiness.json`, zero audit failures/rejects, exact family/fight counts and archived hashes. A captured summary or a shard exit alone is not completion. Preserve development status and separate publication gates.
- Require zero rejected actions, zero duplicate-roster violations, and zero shared-creature violations.
- Require every cohort's map counts to sum correctly and, for balanced run sizes, match across the live Normal, Lava, and Block boards. Flag Water as non-live if it appears in a legacy research run.
- Require one valid gzip per cohort with one raw record per paired matchup.
- Require pooled, per-cohort, per-map, and cohort-by-map ranking rows for units, exact active synergy choice/levels, both artifact tiers, exact augment plans, and augment levels.
- Require exploration support before naming artifact or augment winners. Label smoke output non-inferential because 96 plans cannot be supported adequately by a tiny sample.
- Require the report to be standalone, embed its images, expose all reported units in comparative plots, and contain cohort and map filters.

## Interpret and hand off results

- Use draw-aware score rate for the primary ranking; a draw contributes 0.5. Report the 95% interval and matchup support alongside each leader.
- Explain that every distinct matchup is fought twice with complete armies swapping physical seats. “Non-mirrored” means opposing rosters have different signatures and no shared creature identities; the seat swap is an intentional confidence cluster.
- Compare units within creature level. Unit rankings are associative roster outcomes, not isolated causal effects.
- Treat each synergy row as exact faction, selected synergy, and effective L1/L2/L3 activation. These rows are associative and faction-composition-confounded; the deterministic deployed setup policy does not randomize between alternative synergies.
- Use the recorded full action probabilities and family clusters when evaluating exploratory artifact/augment evidence. These are logged outcomes, not matched alternative outcomes; small or composition-confounded cells do not establish causal strength. Treat overall pick rate as the 80/20 contextual policy's preference.
- For explicit legacy-oracle runs, state that contextual Tier-1/Tier-2 choices see both completed rosters and the map. Premium studies preserve legally projected draft observations and draft-time artifact choices; six prescribed-army cohorts bypass drafting. Neither collection proves live-advisor quality.
- Premium V3/V4 sample Scout, Spymaster and Battle Trance independently with 5/6/7-point budgets and 783 full-budget six-axis plans including Empower. Report actual doctrine assignment counts and support. Legacy runs use seven-point plans. Treat exact plans as the unit of comparison and individual levels as compositional diagnostics.
- Treat observed maxima with overlapping intervals as a tier. The 96-plan search has multiplicity and winner's-curse risk.
- Include clickable links to the HTML, summary JSON, SQLite, output receipt and output directory. State fights, paired matchups, maps, quality violations, source SHA/commit/dirty state, snapshot status and focused-test status. Never describe a development snapshot as published Premium data.

Do not silently substitute `run_tournament.ts`; that runner measures mirrored version-vs-version fights and answers a different question.
