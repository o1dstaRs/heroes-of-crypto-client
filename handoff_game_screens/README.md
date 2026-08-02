# Handoff: in-game screens (Heroes of Crypto client)

## What this is
Three HTML design references for the live client — **design references, not production code**. Recreate them inside `heroes-of-crypto-client` (React + TS + MUI Joy) using the existing components named below. Do not lift the HTML.

Open any `.dc.html` in a browser to inspect it (needs the sibling `support.js`, `_ds/` and `assets/`). Each is authored at **1920×1080**; the board is a 1080px square, sidebars 420px — the same result `LeftSideBar`'s `barSize` math gives at that resolution (`(width - 2048*scale)/2`).

- `Current Fight Screen.dc.html` — fight in progress, lap 2, green team's turn. **This one carries new design work** (see "Fight screen — new visual treatment").
- `Current Placement Screen.dc.html` — sandbox placement (square spawn zones, Army/Board/Reds/Greens right bar).
- `Current Placement Screen (Ranked).dc.html` — ranked placement (rectangle spawn band, `RankedGameView` panel).

## Fidelity
**High.** Every color, size, radius, border and shadow below is final. Copy is final English copy. Numbers in the stat rows / damage bars / fight log are sample data.

## Fight screen — new visual treatment (the actual ask)
Only the **left sidebar** changed; board and right bar match today's build. Apply inside `LeftSideBar/` (`index.tsx` + `UnitStatsListItem.tsx`), keeping the existing `sidebarMetrics` sizing contract — every value below is chrome, not layout.

**Team banner (replaces the rotated `overlay_green.webp` / `overlay_red.webp` strip)**
- Wash: `radial-gradient(120% 55% at 50% 0%, rgba(0,190,60,.26), rgba(0,190,60,0) 62%)` over the whole bar, `z-index:0`, `pointer-events:none`.
- Banner: 300×560px, top-centred, `clip-path: polygon(0 0, 100% 0, 100% 86%, 50% 100%, 0 86%)` (swallow tail), fill `linear-gradient(180deg, rgba(0,150,52,.5), rgba(0,110,40,.3) 55%, rgba(0,80,30,0))`, side fade via `mask-image: linear-gradient(90deg, transparent, #000 26%, #000 74%, transparent)`.
- Cornice: 300×5px at the very top, `linear-gradient(90deg, rgba(220,177,88,0), rgba(220,177,88,.7), rgba(220,177,88,0))`.
- Red team: same geometry with the red ramp — `rgba(150,26,20,.5) → rgba(110,18,14,.3) → transparent`, wash `rgba(200,40,30,.26)`.

**Portrait** — 340px circle (`metrics.portraitMax` cap), `border:4px solid #caa24f`, `box-shadow: 0 6px 18px rgba(0,0,0,.7), inset 0 0 24px rgba(0,0,0,.55), 0 0 0 2px #1b140f, 0 0 22px rgba(220,177,88,.22)`.

**Stone plate** (wraps the stat grid, and the turn card) — `padding:10px`, `radius:8px`, `background: linear-gradient(180deg, rgba(38,26,14,.92), rgba(16,11,6,.94))`, `border:2px solid #6b5222`, `box-shadow: inset 0 0 0 1px rgba(220,177,88,.22), inset 0 2px 10px rgba(0,0,0,.6), 0 2px 6px rgba(0,0,0,.5)`.

**Stat cell** — each `StatItem` sits in its own recess: `padding:3px 6px`, `radius:5px`, `background: rgba(0,0,0,.32)`, `box-shadow: inset 0 0 0 1px rgba(220,177,88,.16)`. Grid stays `repeat(metrics.statColumns, minmax(0,1fr))`, gaps 8px. Icons are the existing `ui/svg/*` components at 22px; a modifier chip still claims two columns.

**Section title** (Abilities / Buffs / Up next) — 0.8rem, weight 800, `letter-spacing:.12em`, uppercase, `#dcb158`, `text-shadow:0 1px 0 rgba(0,0,0,.8)`, followed by a 2px rule `linear-gradient(90deg, rgba(220,177,88,.55), transparent)`.

**Ability / buff tiles** — keep `metrics.abilityCell` / `metrics.effectIcon` sizes; frame becomes `border:2px solid #6b5222` + `box-shadow: inset 0 0 0 1px rgba(220,177,88,.35), 0 2px 6px rgba(0,0,0,.55)`. Aura abilities stay circular, the rest `border-radius:15%`. Stack-power pips unchanged (5 pips, `rgba(0,210,0,1)` / `rgba(255,0,0,1)` active, `rgba(34,34,34,.7)` empty).

**Unit name** — 1.02rem, weight 800, `letter-spacing:.03em`, `#f2e3c0`, `text-shadow:0 1px 0 rgba(0,0,0,.85)`.

Untouched on this screen: `MessageBox` CASE-2 content ("Green team's turn" + `TimelapseRoundedIcon` + `TurnTimerBar` with the LAP medallion), `UpNext` avatars, `TeamAmountFlag`, `PlayRankedBadge`, `FightLog`, `DraggableToolbar`, the Damage toggler.

## Placement screens
- **Sandbox** (`Current Placement Screen.dc.html`): 3×3 spawn squares in the corners (`DrawableSquarePlacement` colors — lower `rgb(110,210,95)`, upper `rgb(255,95,60)`), unit card + `MessageBox` not-started branch (title + `${n}s until auto-start` + `LinearProgress`, **no** TurnTimerBar), right bar = `FightControlToggler` (Army expanded with slots-left chip, `# of units` input, Accept/Clone, split slider, Split/Delete; then Board / Reds / Greens collapsed) + `FightLog` + fullscreen/version.
- **Ranked** (`Current Placement Screen (Ranked).dc.html`): rectangle spawn band `rgba(214,84,52,.34)` inset 6% across the board top, stacks with `TeamAmountFlag` + HP pips, green stacks along the bottom edge; right panel is the `RankedGameView` sheet at `top:12 right:12`, width 340, `hocPanelSx` + `blur(10px)`: header chips (phase / countdown / opponent / status / seq), `WalletLinker compact`, `You: Red`, the Step-2-of-2 box (`hocColors.orangeSoft` on `orangeBorder`), roster strip, `Artifacts`, `Augments & Synergies (n/n pts)` with 42px tiles + `L{n}` badges, `Ready Placement` (`hocPrimaryButtonSx`).
  - ⚠ The roster strip in this file is the **segmented “Your army | 👁 Spymaster + portraits”** row from the user's live build. `main` still ships two stacked `RankedArmyRosterRow` blocks (with `Placing…` chips and unit counts) — reconcile against whatever is actually in the working tree. The 👁️ glyph is `PERK_COPY[SEE_ALL].icon` from `ui/perkCopy.ts`.

## Tokens
From `ui/hocTheme.ts`: `#070504`, panel `rgba(14,9,5,.94)`, orange `#ff8f00`, gold `#dcb158`, parchment `#efe4cc`, muted `rgba(239,228,204,.66)`, danger `#ff5a3f`, border `rgba(255,143,0,.42)`. Frames add `#caa24f` / `#6b5222` / `#1b140f`. Team colors `rgba(0,210,0,1)` / `rgba(255,0,0,1)`; log/damage red `#e23a3a`, green `#21a145`.

## Assets
`assets/` holds 110 `*.webp` from the repo (creature portraits, artifacts, augments, synergies) — use the repo originals. Placeholders in these files, because `game/core/images/` is not committed: board floor art, toolbar button atlas, ability/buff artwork, the Damage icon, the lava wall.
