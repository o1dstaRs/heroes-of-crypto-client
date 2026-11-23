# Heroes of Crypto — Client

Turn-based strategy game client (PixiJS + React) and marketing site (Astro).

## Structure

```
heroes-of-crypto-client/
├── game/
│   ├── core/                    # Game client (PixiJS render + React UI)
│   │   ├── src/
│   │   │   ├── scenes/          # Sandbox (main fight scene), LoadingScreen, etc.
│   │   │   ├── pixi/            # PixiApp, PixiGameManager, PixiScene base
│   │   │   ├── ui/              # React components (LeftSideBar, RightSideBar, DraggableToolbar, etc.)
│   │   │   └── ui/index.html    # Vite entry point
│   │   └── package.json
│   └── heroes-of-crypto-common/ # Git submodule — shared game logic (engine, units, spells)
├── site/                        # Astro marketing site (heroesofcrypto.io)
│   ├── src/
│   │   ├── content/blog/        # Markdown blog posts (frontmatter: title/date/tags/excerpt)
│   │   ├── components/          # HomePage, SiteHeader, SiteFooter, blog pages
│   │   ├── layouts/             # BaseLayout (SEO, fonts, security headers)
│   │   └── styles/global.css    # Dark cinematic theme
│   └── astro.config.mjs
├── package.json                 # Workspace root (bun)
└── lerna.json
```

## Tech stack

- **Runtime:** Bun >= 1.4.5
- **Game render:** PixiJS v8 (y-up world, sprite atlases, container depth-sorting)
- **UI:** React + MUI Joy (sidebars, toolbar, overlays)
- **Site:** Astro 7 (static, sitemap, content collections)
- **Shared logic:** `@heroesofcrypto/common` (git submodule from `github:o1dstaRs/heroes-of-crypto-common#main`)

## Commands

```bash
# Install everything
bun install

# Game client dev server
bun --cwd game/core start

# Site dev server
bun --cwd site dev

# Build all (common → core → site)
bun run build:ws

# Verify everything (run before pushing — see "Before you push")
bun run check              # = lint + typecheck + test
bun run lint:fix           # auto-fix eslint + bun fmt + scss + package order
```

Use **`bun fmt`**, not a separate Prettier invocation, for formatting. Run it on the files you changed:
`bun fmt --no-script <paths>`. The `--no-script` flag bypasses a package's `fmt` script so targeted
formatting stays targeted. Use `bun fmt --no-script --check <paths>` for a read-only formatting check;
the repository's lint/check commands remain the validation gate. Do not format a peer's in-flight files.

Run focused tests while editing, then the full `bun run check` once for the finalized source. That
command already runs the common suite; do not also start a separate full common test run alongside
it. Repeat a passed gate when code, dependency pins or relevant configuration change. Consolidate
shared fixtures around observable behavior, and keep full simulations for assertions that need them.

Core tests run in a few long-lived processes (up to 12 locally, 2 on CI; `HOC_TEST_WORKERS` overrides):
scene/logic files are packed into one shard per worker, React UI files run in their own processes, and
files that call `mock.module()` stay `--isolate`d. Per-file isolation re-parsed the Sandbox/RenderableUnit
module graph (~0.6 s) for every file; sharing it cut the suite from ~110 s to ~25 s of CPU. A test must
therefore set up and restore any global it relies on (reset `FightStateManager` in `beforeEach`, check a
stubbed global's value rather than its key) and must not depend on file order. Run `bun run test:core` for
the full suite. Passing any argument (a file filter, `--parallel`, `--timings`) selects bun's per-file
isolated scheduler instead; use it to debug a suspected cross-file leak. To collect fresh per-file timings,
use `bun run test:core --timings tmp/core-test-timings.json --update-timings`.
Keep profiling output in `game/core/tmp`; only deliberately update `game/core/scripts/test_timings.json`
when changing the scheduling profile. Animation tests should advance a controlled clock instead
of sleeping through real animation time.

`bun run test:common` reuses common's bounded parallel runner and timing profile: up to 12 local
workers and 2 on CI. Use `HOC_TEST_WORKERS=2` on a busy shared machine. For an explicitly
memory-limited release run, set `HOC_WORKSPACE_TEST_BATCH_SIZE=1` through `10` to retain serial
process recycling instead. Both modes discover the complete common suite; never drop tests to
meet a runtime or memory budget.

## Before you push

### Sync with the remote first — always

Before you push, before you open **or update** a PR, and before **any** deploy, bring the branch you are
standing on up to date with its remote:

```bash
git fetch <remote>                       # remote is `origin` here; check `git remote -v`, it is not always the same
git -c rebase.autoStash=false pull --rebase -X ours <remote> <branch> # the branch you are ON, not always main
```

Peers push to these branches continuously, so "it was current when I started" is never true by the time you
finish. Skipping this produces a non-fast-forward rejection at best, and at worst a deploy built from code
that is already behind what the PR claims.

**Remote changes take precedence in conflicting hunks.** During a rebase, `ours` is the upstream-based
history and `theirs` is the local commit being replayed, so use `--rebase -X ours`. For an ordinary merge
of the remote branch, the corresponding option is `-X theirs`. Preserve nonconflicting local work; never
replace whole files with `git checkout --ours/--theirs`, or use the whole-tree `-s ours` strategy. Resolve
any remaining conflicts per hunk with the remote intent taking precedence, then verify both the remote
change and unrelated local changes survived. Never stash a peer's edits to make the pull succeed.

**Deployment must enforce freshness, including direct server deploy commands.** Sync before validation
and building. Record the branch and commit being built; fetch that same remote branch again immediately
before each upload. If the checkout, upstream, or remote commit changed, stop and rebuild from a newly
synced checkout. Never rebase after a build and upload the older output. Deploy only clean, published
commits, and recheck the common pin. Use the guarded deploy commands; manual rsync must not bypass them.

**Re-check the submodule pin after every rebase or merge.** A submodule pointer does not report a conflict:
git silently resolves `game/heroes-of-crypto-common` to one side, and because it is configured
`ignore = all` a drifted pin never shows up in `git status`. A pin one commit behind compiles and passes
type-check while the client asks the engine for something it does not have.

```bash
git ls-tree HEAD game/heroes-of-crypto-common          # recorded pin
git -C game/heroes-of-crypto-common rev-parse HEAD     # what is actually checked out
```

If they differ, re-record deliberately with `git add game/heroes-of-crypto-common`. When the pin moves, the
**server's** `package.json` pin and its `bun.lock` must move with it in the same commit — a pin bumped
without the lockfile fails the deploy's `bun install --frozen-lockfile` on the box and rolls back.

Then re-run the gate below: a clean merge is not a passing build.

CI runs **`bun run lint`** check-only (eslint + stylelint + sort-package-json + `bun fmt`), so unformatted
or lint-dirty code fails the build even though it runs fine locally. Run the full gate first:

```bash
bun run check       # lint (eslint/stylelint/bun fmt --check) + typecheck (tsc) + test (bun test)
```

If `check` fails:

- **Style/lint** (`bun fmt`/`eslint`/`scss`/package order) → `bun run lint:fix`, then re-run `bun run check`.
  (The `.githooks/pre-commit` hook auto-fixes _staged_ files via `lint-staged`, but only if hooks are
  enabled — `bun install` wires them via `prepare`. Don't rely on it; run `bun run check` yourself.)
- **typecheck** → fix the type errors in _your_ files. A peer editing `main` may leave a transient `tsc`
  error in files you didn't touch — verify your own change with `bun test` rather than blocking on it.
- **test** → some suites are peer-owned WIP (e.g. `AIController.*`, `ai/v0_*`); ensure the tests covering
  _your_ change pass, and don't "fix" a peer's failing test.

### Changes to the `@heroesofcrypto/common` submodule

`bun run check`'s typecheck reads common's built `dist`, so after editing `game/heroes-of-crypto-common/src`
rebuild it (this also runs `bun fmt` + the common test suite + `tsc`):

```bash
bun run --cwd game/heroes-of-crypto-common build
```

### Changes to the wire protocol / shared engine (ranked)

The **server** (`../heroes-of-crypto-server`) consumes `common` via a pinned GitHub commit and runs its own
authoritative copy of the engine. When you touch `play_protocol`/`play.proto`/`play_session` or the common
engine, also verify the server and deploy together:

```bash
cd ../heroes-of-crypto-server
npx tsc --noEmit
bun test src/api/game/v1
```

A ranked-affecting common change only reaches the server after: commit + push `common` → bump the server's
common pin (lockfile) → reinstall → restart the ranked server. Client-only fixes take effect on a browser
refresh (vite serves common via the `src` alias).

### Ranked acceptance and draft handoff

An accepted match must reach the picking screen with matchmaking and game confirmation running in
separate processes and Redis queues/pub/sub disabled. A successful `POST /confirm` acknowledges that
player's acceptance; it does not mean the draft is ready. Keep the matchmaking stream mounted while
waiting for the server's `c: 1` handoff, and preserve acceptance/error recovery in
`game/core/src/ui/MatchmakingRoute.tsx`.

The server reconciles open matchmaking streams against persisted game readiness. Never replace this
with a process-local confirmation queue or assume a combined local server proves production works.
Changes to acceptance, SSE, confirmation, or draft creation must preserve the server's
`src/api/mm/v1/matchmaking_handoff.test.ts` and `matchmaking_handoff.integration.test.ts`, including the
separate game process, disabled Redis, empty matchmaking queue, and automatic timer delivery. The
server README's **Matchmaking handoff** section documents the invariant and regression command.

## Conventions

- **No per-user absolute paths in tracked files.** Never commit `/Users/<name>/…`, `~`, npx-cache
  module paths, or sibling repos referenced by absolute path — in code, scripts, docs, or env
  examples. They only work on one machine and leak the owner's username.
    - Env-var examples in docs use `"$HOME/Google Drive/…"` — `$HOME` expands inside double quotes;
      a quoted `"~/…"` stays literal and nothing downstream expands it (see `assetLocations.ts`).
    - Sibling repos (e.g. `../heroes-of-crypto-server`) are resolved relative to the importing file
      or via an env override (`HOC_SERVER_LOC`, `PLAYWRIGHT_LOC`), never hard-coded.
    - One-off local convenience paths belong in your shell profile or an untracked `.env`, not the repo.
- `RenderableUnit.fromBase()` uses `Object.setPrototypeOf` — class field defaults don't run. Always explicitly initialize new fields in `fromBase()` or they'll be `undefined`.
- World root has `scale.y = -1` (y-up). All world-space graphics/text must account for the flip.
- A seated player can see the board mirrored left-to-right (settings → "Your side of the battlefield";
  `pixi/boardMirror.ts`). World-space text and other glyphs that are read rather than looked at take their x
  scale from `glyphScaleX()` (or `keepGlyphRowUpright()` for an icon-and-number row), and code comparing a
  unit's facing with screen-space bounds uses `screenFacing()`. Otherwise the text renders backwards.
- Pixi z-index: terrain ~20, gameplay graphics ~55, units ~4000 (sorted by Y), overlays ~5500+.
- **A visible frame must begin and end with an empty Pixi filter stack.** Keep `PixiApp` rendering behind
  `renderWithFilterRecovery`, including recovery before the draw and in `finally`. Catching a render error
  alone leaves filter bounds active and shifts units/obstacles away from the floor on later frames. Do not
  reset the stack inside a valid nested render, or return stale/popped filter textures still leased by Text.
  Changes to Pixi versions, filters, texture lifetime, or render entry points must pass
  `recoverInterruptedFilters.test.ts` and `PixiApp.lifecycle.test.ts`; both run in the existing core CI suite.
- The `@heroesofcrypto/common` submodule tracks `main`. Run `git submodule update --remote` to pull latest.
- **No two tracked paths may differ only by letter case** (`ui/liveMatchBanner.ts` next to `ui/LiveMatchBanner.tsx`).
  macOS and Windows see one path, so bun and Vite resolve whichever they find first and Vite caches it until
  restarted, while Linux CI stays green. `bun run check:case` (part of `bun run check`) fails on any such pair.

## AI tournament analyser

Read the server's [AI strategy status](../heroes-of-crypto-server/docs/ai_strategy_status.md) for the
current serving profile, adopted improvements and research priorities. Versioned draft,
combat and historical profile numbers are separate; avoid treating an old adoption as today's default.

**Pre-fight goals (owner, November 21, 2026).** The owner's standing goal covers everything a ranked AI seat does
before the fight. It draws each doctrine a third of the time and uses its information (map, opponent units, bans).
It plans synergies, picks counters and map-suited units, and chooses artifacts and upgrades for its strategy. It
places, and splits, its units well. Read the server's
[AI pre-fight goals and scorecard](../heroes-of-crypto-server/docs/ai_prefight_scorecard.md). Every draft, ban,
artifact, upgrade or placement change names the goals it advances and reports the scorecard metric before and after.

Current default is profile v28, revision suffix `lava-map-v1-valkyrie-striker-v1`. `a19-valkyrie-striker-v1` was adopted
on November 23, 2026, under the standing instruction, after the owner saw a rushing AI leave its Valkyries at the back
(game b02a58ce). The striker-rush formation now moves Valkyrie with the strikers. Read common's
`docs/valkyrie_striker_adoption.md`. Registered confirmation S on fresh sealed families: on rush armies with a Valkyrie
+7.36 points per task (95% +4.72 to +10.02). Confirmation P, which also put flyers in the middle rows, failed and is not
adopted. Not a win rate against people.

Profile v27, retained in v28: revision suffix `counter-draft-v1-lava-map-v1`. `a19-lava-map-artifact-v1` was adopted
on November 22, 2026, under the standing instruction, after the owner saw the AI suggest Lava Striders on a map without
lava. With the map public at the Tier-2 pick, Lava Striders is never taken without lava while a usable artifact is
offered. Read common's `docs/lava_map_artifact_adoption.md`. Registered confirmation V on a fresh sealed bank: without
lava +0.48 points per task (95% +0.24 to +0.73); the owner-rush guard passed. Its lava-map rule (a striker army takes
Lava Striders) failed its strength gate (+0.09, 95% −0.32 to +0.51) and is not adopted. Not a win rate against people.

Profile v26, retained in v27: revision suffix `decoy-aware-v1-counter-draft-v1`. `a19-counter-draft-v1` was adopted on
November 22, 2026, under the standing instruction, for the owner's goal of a draft that reads the opponent and counters
from what is available. Once a default seat sees two opposing creatures that read melee, it drafts with a matchup model
of creature counters fitted on 40,040 production games; against shooter armies the striker draft keeps the rush. Read
common's `docs/counter_draft_adoption.md`. Registered confirmation Z on a fresh sealed bank: against the default AI
+5.30 points (95% +1.19 to +9.35); the owner-rush (−0.31), decoy-fort (+0.62), Queen-fort (+1.75) and caster (+2.01)
guards passed. Not a win rate against people.

Profile v25, retained in v26: revision suffix `deep-fit-v1-wild-regen-v1-decoy-aware-v1`. `a19-decoy-aware-v1` was
adopted on November 22, 2026, under the standing instruction ("always lock in wins please"). The owner beat the brutal
AI with a checkerboard wall of one-creature Fairy splits in front of a two-shooter corner fort (game 9a1003ec). A melee
unit no longer strikes a one-model decoy (a one-creature stack whose creature has a bigger living stack) while it can
strike a real stack. Read common's `docs/decoy_aware_adoption.md`. Registered confirmation Y on a fresh sealed bank:
against the checkerboard decoy-fort layout +6.33 points (95% +2.59 to +10.05); the ring-fort (+8.33), mirror (+1.62)
and owner-shaped (+0.75) guards passed. The estimate is against AI-played armies, not a win rate against people.

Profile v24, retained in v25: revision suffix
`rejection-fixes-v1-deep-fit-v1-wild-regen-v1`. `a19-wild-regen-gift-v1` was adopted on November 22, 2026, by the
owner's explicit decision: the Troll's one-way Wild Regeneration gift goes only to an ally whose creatures have more max
HP than the caster's (the owner saw a Troll give it to a one-creature Fairy split instead of the Griffin). Read common's
`docs/wild_regen_gift_adoption.md`. Registered confirmation W: +0.05 points (95% −1.97 to +2.09), gifts to weaker
creatures 526 → 0. Its owner guard failed (−2.34) and stays recorded as failed; no strength gain is claimed.

Profile v23, retained in v24: revision suffix `keep-attack-v1-rejection-fixes-v1-deep-fit-v1`. `a19-deep-fit-v1` was
adopted on November 22, 2026, under the standing instruction at the owner-approved think budget ("4s is fine"). A bot seat runs the deep A19 search (8
rollouts, shortlist 10, max melee 16) after the stock search whenever both fit 2,800 rollout turns (about 4 s).
Premium advice keeps the stock search. Read common's `docs/deep_fit_adoption.md`. Registered confirmation M: mirror
+5.35 points (95% +2.72 to +8.06), owner-shaped guard +3.67. Its quality gate failed (10 candidate games against
6, all refusal causes that v22 fixes) and stays recorded as failed. Confirmation K, the same rule at 1,400 turns,
failed its strength gate.

Profile v22, retained in v24: revision suffix `tier2-striker-v1-keep-attack-v1-rejection-fixes-v1`.
`a19-rejection-fixes-v1` was adopted on November 21, 2026, at the owner's request ("Need to fix all rejection causes"). Read common's
`docs/rejection_fixes_adoption.md`. In production code every refused AI action had one of three causes, and all
three are fixed. In common: the native decision no longer moves and then strikes from the old cell
(`a19CoherentMeleeApproach`), and a v0.1 move route, which mindless units follow, must end in the engine's
zone-of-control-aware paths. In the server: the turn advance no longer gives up after a run of skipped turns.
The registered non-inferiority confirmation passed all six gates. Mirror +0.06 points (95%
−0.94 to +1.07); owner-shaped guard +0.10; entrant refusals 5 → 0.

Profile v21, retained in v22: `a19-keep-attack-v1` was adopted on November 21,
2026, at the owner's request: units sometimes moved up to an enemy and did not attack. A melee unit's
search no longer lets a non-attacking challenger replace a native melee attack, and while any scored
candidate attacks, a plain move that ends next to an enemy cannot win (`SEARCH_A19_KEEP_MELEE_ATTACK`,
`SEARCH_A19_KEEP_CONTACT_ATTACK`, sealed on in common's search rules). Read common's
`docs/keep_attack_adoption.md`. It was registered as a non-inferiority check on a fresh sealed bank
and all six gates passed. Mirror +1.34 points (95% −0.39 to +3.05); owner-shaped guard +2.15; plain
moves into contact 3,499 → 84. Do not report it as a strength gain. Rule 1 alone (confirmation J,
+0.33) failed its strength gate and stays recorded as failed.

Profile v20, retained in v21: `a19-tier2-striker-v1` was adopted on
November 21, 2026, under the same standing instruction: an army with fewer than two ranged stacks takes
Crown of Command as its Tier-2 artifact when it is offered and the opponent's melee probability is below
0.8, and otherwise prefers an established artifact to the five that artifact-fit-v8 scores with a
forecast (`HOC_A19_TIER2_STRIKER`). Such armies used to read the v0.7 melee table, where Crown is the
lowest entry. Read common's `docs/tier2_striker_adoption.md`. Preserve the registered +7.06-point
estimate (95% +4.39 to +9.76; 1,693 changed games on a fresh sealed bank); its quality gate (G4: two
candidate games against one with a declined scripted melee proposal) failed and stays recorded as
failed: do not waive, re-run or relabel it. Premium's Tier-2 advice follows the same rule. New default
comparisons use v20.

Profile v19, retained in v20: `a19-striker-rush-one-shooter-v1` was adopted on November 20, 2026,
under the same standing instruction: an army with exactly four strikers is rushed from one shooter
instead of two; casters do not count (`HOC_A19_STRIKER_RUSH_ONE_SHOOTER`). Read common's
`docs/striker_rush_one_shooter_adoption.md`. Preserve the registered +4.64-point estimate (95% +0.91
to +8.40; 927 changed games on a fresh sealed bank); its quality gate (G4: two candidate games
against one with a declined scripted melee proposal) failed and stays recorded as failed: do not
waive, re-run or relabel it.

Profile v18, retained in v19:
`a19-striker-rush-mixed-v1` was adopted on November 20, 2026, under the user's standing instruction
of November 19: “always lock in wins and continue”. Read common's
`docs/striker_rush_mixed_adoption.md`. The striker rush used to stop at three enemy strikers; it now
also covers an army with exactly four strikers and at least two shooters, the army shape people
bring most (`HOC_A19_STRIKER_RUSH_MIXED`; it also goes off with the striker rush). Do not widen it:
“any army with four strikers” was registered first and failed its mirror guard. Preserve the
registered +9.20-point estimate against mixed armies (95% +6.81 to +11.68; 576 sealed tasks)
together with its failed quality gate, four candidate games against one with a declined scripted
melee proposal: do not pass, waive or re-run it. The estimate is against mixed armies drafted by
the AI, not a win rate against people.

`a19-striker-matchup-v1` was adopted on November 20, 2026, as profile v17, retained in v18, under
the same standing instruction. Read common's `docs/striker_matchup_adoption.md`.
Every striker has two measured values, one for a rush against an army that is not melee and one for
a fight against a melee army; after the striker rush head a default seat takes the striker on offer
worth most for the probability that the opponent ends with four or more strikers, computed only from
the opposing creatures the seat may legally see (`HOC_A19_STRIKER_MATCHUP`; it also goes off with the
striker rush). The values are fitted on exploration drafts with random striker picks: a changed
value is a new candidate and needs its own confirmation. Preserve the registered +28.06-point
estimate against v16 (95% +22.96 to +33.06; 540 sealed tasks, all three maps positive, all six
registered gates passed) with its meaning: it is against a default that does not adapt, two matchup
seats meet at 50%, and it is not a win rate against people; against v14 the draft measured +3.52
(95% −0.83 to +7.96), not worse, gain not established.

`a19-shooterless-movement-v1` was adopted on November 20, 2026, as profile v16, retained in v18,
under the same standing instruction. Read common's
`docs/shooterless_movement_adoption.md`. A seat without a ranged creature spends the Sniper point of
its upgrade plan on Movement, because Sniper does nothing for such an army; only seven-point plans
hold that point, and a rush or funded delivery plan is left as it is
(`HOC_A19_SHOOTERLESS_MOVEMENT`). Preserve the registered +8.06-point estimate (95% +3.89 to +12.04;
540 sealed tasks; all five registered gates passed) with its scope: a seven-point seat against v15,
a melee mirror. One default seat in three has seven points, games the seat rushes are unchanged, and
it is not a win rate against people. Armor 3 and Might 3 stay first: do not extend the rule to five-
and six-point plans.

`a19-striker-rush-v1` and the Tier-2 beneficiary rule (`artifact-fit-v8`) were adopted on November 20,
2026, as profile v15, retained in v18, under the same standing instruction. Read
common's `docs/striker_rush_adoption.md`, `docs/striker_rush_research.md` and
`docs/artifact_beneficiary_rule.md`. Default seats draft melee strikers and, with both rosters public
and at least four strikers facing at most three (v18 adds exactly four with two shooters), buy
Placement 2 and Movement 2 and start their real striker stacks on the edge of the zone nearest the
enemy; against a melee army they keep their native setup. The draft head and the setup rule are one policy with one switch (`HOC_A19_STRIKER_RUSH`): the
draft head alone measured +0.0. Preserve the registered +28.80-point estimate against v14 (95% +23.52
to +34.07; 540 sealed tasks, all three maps positive) together with its two failed registered gates,
quality and cost: do not pass, waive or re-run them. Each searched decision costs about 39% more CPU
offline and live latency under the decision deadline is unmeasured. The estimate is against a default
that fields shooters; it is not a win rate against people. The artifact rule rests on a 239-pair
changed-case diagnostic, not on a registered confirmation. A19 search, weights, models and budgets are
unchanged. Frozen studies and seed exclusions remain unchanged.

The user adopted `a19-neutral-barrel-deliberation-v1` on November 19, 2026, as profile v14, revision
suffix `delivery-v1-sniper-v1-neutral-barrel-v1`, retained in v18. Read common's
`docs/neutral_barrel_deliberation_adoption.md`. On Cemetery, A19 now searches a scripted strike on a
neutral barrel against the other legal actions instead of returning it. Preserve the +3.58-point
held-out estimate against v13 (95% +2.44 to +4.75) together with its two failed registered gates,
quality and serial cost: the adoption did not pass, waive or re-run them. The estimate changes one
seat on Cemetery only and is not a global win rate. Keep the native cleanup, forecasts,
deployment-barrel handling and other maps unchanged.

The user adopted the confirmed `a19-preserve-sniper-20261118` checkpoint on November 18, 2026,
establishing profile v13, retained in v18. Read common's
`docs/sniper_donor_adoption.md`. Preserve the conditional +8.10-point held-out evidence and exact
eligibility: protect native Sniper >= 2 before delivery previews in public complete funded setup,
with an unused delivery draft budget and standard own draft quantities. Keep A19 combat and V3/contextual
draft intact, preserve older funded plans through restart, and retain Premium apply/undo. Frozen
studies and seed exclusions remain unchanged.

The user explicitly adopted the separate revealed-ranged draft/setup candidates on November 18, 2026 UTC.
This established profile v12, `revealed-ranged-exclusive-delivery-v1`, retained in v18: after consuming
its delivery draft override, a seat keeps native setup; otherwise the funded delivery setup can apply.
Read common's `docs/revealed_ranged_delivery_adoption.md`. Keep the uncertain +7.407407 pp and +9.259259 pp
component results, failed −1.851852 pp combination, immutable checkpoints and exclusions intact.
The estimates are not additive or fresh qualification. Preserve public visibility, persisted independent
budgets, Premium routing and atomic collision/restart behavior. The wire default remains v0.8 with
locked V3/contextual draft and A19 combat.

The user adopted `public-terrain-formation-reflection-v1` on November 17, 2026, establishing profile
v11; that layer remains part of current v18 with locked V3/contextual draft and A19 combat. Read common's
`docs/terrain_placement_adoption.md` before changing it. Preserve its +7.638889-point exploratory
estimate and 95% interval 0 to +16.666667 as uncertain evidence, not a passed qualification.
The serving rule covers default AI and Premium formation, uses only public neutral barrels,
and leaves normal/lava placement unchanged.

The user explicitly adopted `nightmare-wall-movement-coverage-v1` into the A19-backed v0.8 default
on November 17, 2026, establishing profile v10 before the terrain adoption above. The locked V3/contextual draft and accepted
neural models retain their identities. Read
`game/heroes-of-crypto-common/docs/nightmare_wall_movement_adoption.md` before iterating on it.
Preserve the exact ground-wall plus omitted-movement comparison policy and its original failed
qualification evidence. New experiments compare against the adopted default; already-running frozen
studies keep their registered comparator. That adoption's revision ended in `barrel-v1-nightmare-v1`;
the current v18 revision ends in `shooterless-v1-matchup-v1-rush-mixed-v1`.

For v0.9 draft iteration, retain the user-locked `doctrine-draft-v3-20261104` benchmark in common's
`src/simulation/v0_9/checkpoints/`. Its exact weights and original evidence are preserved; fresh overall
confirmation measured **+3.34 match-score points (95% interval +2.20 to +4.49)** on the ranked A19
profile. V4 failed to improve over it. Read common's `AGENTS.md` and `docs/v0_9_doctrine_training.md`
before changing this model. The user subsequently activated it as the **default draft for v0.9 seats**.
Separate native-profile qualification passed at **+1.76 points (+0.91 to +2.62)** on 1,512 fresh boards;
its secondary early-information comparison was +0.347 points (+0.025 to +0.694). The original
scouting study remains failed and unchanged. Preserve the native fixture, fixed candidate policy,
legal visibility, and persisted one-override budget through collision retries and restarts. This
draft activation does not change the global default AI version or promote a new combat artifact.

Placement research has an explicit [promotion gate](game/heroes-of-crypto-common/docs/placement_research_promotion.md).
Negative or inconclusive explorations stay outside shipped profiles. Extra early attacks, a favorable matchup,
or a positive subgroup cannot replace a fully funded gain against both current behavior and a matched free
formation, followed by fresh held-out confirmation. Keep `placement_research_isolation.test.ts` passing.

For legacy version-to-version benchmarks, the following runs headless mirrored battles
(`common/src/ai`: `v0.1`/`v0.2`/`v0.3`). Current ranked strategy screens use the server's
`docs/ai_iteration.md`, fixed independent families and each study's registered promotion gates.
Run from `game/heroes-of-crypto-common`:

```bash
# <vA> <vB> [games] [seed] [outDir] [concurrency] — pass 12 (one per perf core; default 16 oversubscribes)
bun src/simulation/run_tournament.ts v0.2 v0.3 6000 1 "$(pwd)/sim-out" 12
bun src/simulation/run_match.ts v0.2 v0.3 <seed>   # single game, per-lap log
```

This is an **M4 Max (12 perf + 4 efficiency cores)** — use concurrency `12`. Output: `sim-out/*.jsonl` +
`.summary.json`. Legacy mirror self-play is variance-heavy; 6000+ games is a rough planning baseline,
not a promotion gate. Judge small gains by paired family intervals, activation and fresh confirmation,
not an automatic 1% cutoff or raw battle count.

## Local E2E testing

The repo-owned `heroes-e2e` skill is available to Claude, Codex, and opencode. Its canonical files live
under `.claude/skills/heroes-e2e`; `.agents/skills/heroes-e2e` is a relative symlink to the same directory.

```bash
.claude/skills/heroes-e2e/scripts/hoc-e2e.sh match       # full human-vs-human pick/ban match
.claude/skills/heroes-e2e/scripts/hoc-e2e.sh vs-ai       # human-vs-AI match
.claude/skills/heroes-e2e/scripts/hoc-e2e.sh placement   # skip pick/ban and test placement/play
.claude/skills/heroes-e2e/scripts/hoc-e2e.sh status
.claude/skills/heroes-e2e/scripts/hoc-e2e.sh cleanup
```

## Canonical agent and simulation tools

- Paired AI strategy screens now have a shared server workflow: `bun run ai:iterate` from
  `../heroes-of-crypto-server`. Read its `docs/ai_iteration.md` for sealed development banks, persistent
  workers, resumable exact-input caching, failure reports and optional confirmation. Reuse this tooling
  for server lifecycle experiments; retain common's existing meta runners, seed ledgers and promotion
  gates. The included timing bank is development-only and is not strategy-strength evidence.
- Keep each repo skill's canonical files in `.claude/skills/<name>`. Every canonical skill must also have a
  relative directory symlink at `.agents/skills/<name>` pointing to `../../.claude/skills/<name>`. Claude
  discovers the canonical path, Codex discovers and follows the `.agents` symlink, and opencode discovers
  both compatible locations. Do not create copied skill bodies or a redundant `.opencode/skills` tree.
- When adding or updating a skill, change the canonical `.claude` files and verify its `.agents` symlink in
  the same PR. Relative script paths in `SKILL.md` must resolve from the repository root for every agent.
- AI meta cohort execution and HTML reporting already live in the common package at
  `src/simulation/measure_ai_meta_cohorts.ts` and `src/simulation/render_ai_meta_report.ts`; Codex also has
  the user-installed `heroes-ai-meta-report` skill. Reuse these instead of adding another cohort runner or
  report generator to a client PR.
- Do not commit generated E2E screenshots, cohort results, JSONL/summary outputs, or HTML reports unless the
  task explicitly requests a versioned fixture. Keep normal run output outside Git and attach review
  artifacts to the PR or issue.

## ElevenLabs MCP

Hosted connector for voice, music, image, and video. US account endpoint only:

`https://api.us.elevenlabs.io/v1/mcp`

This is user config (`~/.codex/config.toml` or `~/.grok/config.toml`), not a file in this repo. Sign-in is OAuth. Do not put an API key in the server block, and do not add `oauth_client_id` or scopes by hand.

Do not open the connector URL in a browser. A GET returns `405 Method Not Allowed`; the client must POST. Do not open `https://elevenlabs.io/app/oauth/authorize` by itself either. That page rejects a request missing `client_id`, `redirect_uri`, `scope`, and `state`. The only usable consent link is the one the login command or the TUI prints.

### Codex

```bash
codex mcp remove elevenlabs
codex mcp add elevenlabs --url https://api.us.elevenlabs.io/v1/mcp
codex mcp login elevenlabs
```

`codex mcp login` opens the browser. Approve the ElevenLabs page. That completes sign-in.

### Grok

Grok has no `mcp login` subcommand. Reset the server the same way, then sign in inside a session:

```bash
grok mcp remove elevenlabs
grok mcp add elevenlabs https://api.us.elevenlabs.io/v1/mcp
```

A bare `https://` URL is stored as HTTP. Do not pass `--transport stdio`.

Then, in the Grok session that should call the tools:

1. Run `/mcps`.
2. Select **elevenlabs**. Press `r` if the list still shows the server from before the reset.
3. Press `i`.
4. Approve the page Grok opens. Use only a link Grok prints that starts with `Open this URL in your browser to approve:`.

`grok mcp doctor elevenlabs` does not sign you in. Outside the TUI it stops at "OAuth authorization required". Headless `grok -p` cannot finish this login. After consent, tokens are in `~/.grok/mcp_credentials.json` (owner-only, mode `0600`). A missing file means this session is not signed in, even when `grok mcp list` shows the URL. Never commit that file or paste it into chat.

A session that was already open when the server was re-added does not see it until `/mcps` → `r`, or until a new session starts.

## Parallel agents / mainline workflow

Multiple agents run on this repo **at the same time**. Rules:

- **Always work on `main` (the shared working tree). Do NOT create git worktrees or branches.**
- **Never use `git stash`** (push/pop/apply) — it sweeps a peer's in-flight edits into your stash and restores
  a tree that never existed. To inspect pre-change behavior, read the committed version with
  `git show HEAD:<file>` instead of touching the working tree.
- **Never revert or discard files you didn't author** — no `git checkout -- <file>`, `git restore`,
  `git reset --hard`, or overwriting a peer's edits to "clean up" the tree.
- Each agent **owns and drives/fixes its own changes** — the build may briefly be red or the working tree may
  churn because a peer is mid-edit; that agent will fix it.
- Stage and commit **only your own files** (`git add <paths>`, never `git add -A`); `git fetch` right before
  pushing. Expect your commit to land alongside others'. Verify with `bun test` (transpiles independently of a
  peer's in-progress `tsc` errors) rather than blocking on a shared `tsc`.

## Game image assets

- For any AI redraw or regeneration of a transparent game cutout (including battlefield creature figures),
  generate the artwork first on a flat, fully opaque chroma-key green background (`#00FF00`). Remove that
  green with edge-aware alpha reconstruction, then apply a final green de-spill. Never use a checkerboard,
  white, gray, or transparency-looking baked background as the extraction source; reject and regenerate an
  output that contains one. Before replacing a canonical asset, inspect the cutout on a dark background and
  verify that no green spill or unwanted light/dark matte remains around the contour.
- Creature balance, abilities, levels, factions, names, and roster changes must not alter existing portrait
  sources, framing, mirroring, or backgrounds. Change creature portraits only when the user explicitly requests
  a portrait change in the current task.
- The user explicitly requested that all game image assets and their authoring materials be synchronized to
  the shared Google Drive. Before finishing image work, save the approved runtime assets, source artwork,
  prompts, references, variants, processing recipes, and relevant metadata there, then verify the copied files
  by SHA-256. Keep working intermediates under game/core/tmp/imagegen; hand off source packages under
  the shared heroesofcrypto/image-sources folder, outside the runtime images directory.
  Other game files (audio, video, fonts, datasets, and unrelated work) stay local unless the user requests
  synchronization. Never use Dropbox or another synchronized cloud folder for game art.
- Runtime game images are canonical only in the directory referenced by HOC_IMAGES_LOC. Since 2026-08 that
  is the shared Google Drive art folder ("$HOME/Google Drive/My Drive/heroesofcrypto/images"); a machine
  without the Drive mount may keep a local checkout at "$HOME/Workplace/heroesofcrypto-assets/images" and point
  HOC_IMAGES_LOC at it (the build never guesses a path when HOC_IMAGES_LOC is unset). Animation atlases and
  metadata are canonical only under HOC_ANIMATIONS_LOC/output. The former Dropbox folder is RETIRED: never
  read from or write to it (stale copies there silently roll art back), and never scatter game art into any
  other synchronized cloud folder.
  Never overwrite shared masters with stale local checkouts or optimized build copies. Check the approved
  revision and preserve differing previous artwork in source-package history before replacing it.
  Never add game art to game/core/public or another tracked game directory.
- Store intermediate image-generation work under game/core/tmp/imagegen. Store final static game images as
  compressed WebP files in the configured HOC_IMAGES_LOC folder; store animation atlas WebPs and *_meta.json
  files in the configured HOC_ANIMATIONS_LOC/output folder. Static images must be valid WebP
  files no larger than 1,766,026 bytes; animation atlas WebPs are exempt from only that size ceiling. Run
  bun run --cwd game/core check:image-assets (also enforced by build:images), then reference assets through
  src/generated/image_imports.ts or texAny(). Do not hard-code public image URLs such as
  /textures/foo.webp or call Assets.load() with a public image path.
- Run bun run check:images before pushing; CI rejects tracked images outside site/public.
- The sole tracked game-image exception is game/core/public/favicon.ico. All other tracked images belong
  under site/public. Attach gameplay review
  screenshots to the PR or issue instead of committing them.
- game/core/images and game/core/src/generated remain gitignored build outputs copied/generated from the
  configured canonical asset directories; do not force-add them.
