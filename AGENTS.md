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

- **Runtime:** Bun
- **Game render:** PixiJS v8 (y-up world, sprite atlases, container depth-sorting)
- **UI:** React + MUI Joy (sidebars, toolbar, overlays)
- **Site:** Astro 6 (static, sitemap, content collections)
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

# Typecheck + lint
bunx tsc --noEmit          # from game/core
bunx eslint "game/**/src/**/*.{ts,tsx}"
```

## Conventions

- `RenderableUnit.fromBase()` uses `Object.setPrototypeOf` — class field defaults don't run. Always explicitly initialize new fields in `fromBase()` or they'll be `undefined`.
- World root has `scale.y = -1` (y-up). All world-space graphics/text must account for the flip.
- Pixi z-index: terrain ~20, gameplay graphics ~55, units ~4000 (sorted by Y), overlays ~5500+.
- The `@heroesofcrypto/common` submodule tracks `main`. Run `git submodule update --remote` to pull latest.

## AI tournament analyser

Benchmarks the versioned AI (`common/src/ai`: `v0.1`/`v0.2`/`v0.3`) in headless mirrored battles.
Run from `game/heroes-of-crypto-common`:

```bash
# <vA> <vB> [games] [seed] [outDir] [concurrency] — pass 12 (one per perf core; default 16 oversubscribes)
bun src/simulation/run_tournament.ts v0.2 v0.3 6000 1 "$(pwd)/sim-out" 12
bun src/simulation/run_match.ts v0.2 v0.3 <seed>   # single game, per-lap log
```

This is an **M4 Max (12 perf + 4 efficiency cores)** — use concurrency `12`. Output: `sim-out/*.jsonl` +
`.summary.json`. Mirror self-play is variance-heavy; use 6000+ games and treat sub-1% deltas as noise.

## Local E2E testing

A skill is installed for both Codex and opencode:

```bash
# Full stack: server + game client + site + seed players + dev match
~/.codex/skills/heroes-local-e2e/scripts/hoc-local-e2e.sh all

# Check status / cleanup
~/.codex/skills/heroes-local-e2e/scripts/hoc-local-e2e.sh status
~/.codex/skills/heroes-local-e2e/scripts/hoc-local-e2e.sh cleanup
```

The skill is symlinked at `~/.config/opencode/skills/heroes-local-e2e` for opencode.

## Parallel agents / mainline workflow
Multiple agents run on this repo **at the same time**. Rules:
- **Always work on `main` (the shared working tree). Do NOT create git worktrees or branches.**
- Each agent **owns and drives/fixes its own changes** — the build may briefly be red or the working tree may
  churn because a peer is mid-edit; that agent will fix it. Don't revert or "clean up" files you didn't author.
- Stage and commit **only your own files** (`git add <paths>`, never `git add -A`); `git fetch` right before
  pushing. Expect your commit to land alongside others'. Verify with `bun test` (transpiles independently of a
  peer's in-progress `tsc` errors) rather than blocking on a shared `tsc`.
