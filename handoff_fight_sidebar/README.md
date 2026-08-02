# Handoff: fight-screen left sidebar, toolbar & grounds

Design spec for `heroes-of-crypto-client`. Reference file: `Current Fight Screen.dc.html` (open in a browser; needs `support.js`, `_ds/`, `assets/`). Authored at 1920×1080 — board 1080px square, sidebars 420px, i.e. what `LeftSideBar`'s `barSize` math yields at that resolution. **Recreate in React/MUI Joy — do not lift the HTML.** Every value below is final; sizing still comes from `sidebarMetrics` (`portraitMax`, `statColumns`, `abilityCell`, `effectIcon`, `gapPx`, `padPx`).

## 1. Grounds (near-black, warm undertone)

Two variants are live in the reference so they can be compared — pick one and use it for both bars:

| | Left bar | Right bar |
| --- | --- | --- |
| fill | `#0b0806` + `linear-gradient(180deg, rgba(255,224,180,.02), rgba(0,0,0,.24))` | `#0e0a06` flat |

Page/app background `#070503`. No texture, no gold wash — the board art must stay the brightest thing on screen.

Bar edges (replaces the old 1px `divider` line):
- left bar: `border-right:3px solid #0a0705; box-shadow: inset -1px 0 0 rgba(120,104,80,.22), 6px 0 18px rgba(0,0,0,.7)`
- right bar: mirrored (`border-left`, `inset 1px 0 0`, `-6px 0 18px`)

## 2. Unit card (LeftSideBar / UnitStatsListItem)

**Portrait + team aura.** The portrait keeps `metrics.portraitMax` (340px at 1080p) and gets a black-and-bronze ring; the team colour is expressed only as a diffuse fire-like aura BEHIND it — no cloth banner, no clipping of the frame. Wrap the portrait in `position:relative; overflow:visible` and put three absolutely-centred, blurred circles behind it (`z-index:0`), portrait at `z-index:1`:

| layer | size | fill | blur | animation |
| --- | --- | --- | --- | --- |
| outer | 480px | `radial-gradient(circle, rgba(40,235,110,.3) 34%, rgba(0,190,60,.14) 54%, transparent 74%)` | 26px | `hocTeamGlow 4.4s ease-in-out infinite` |
| mid | 410px | `radial-gradient(circle, rgba(120,255,170,.26) 40%, rgba(20,200,80,.12) 60%, transparent 78%)` | 14px | `hocTeamFlicker 2.7s ease-in-out infinite` |
| inner | 372px | `radial-gradient(circle, rgba(190,255,210,.2) 46%, rgba(40,220,100,.1) 64%, transparent 80%)` | 8px | `hocTeamFlicker 1.9s ease-in-out infinite reverse` |

```css
@keyframes hocTeamGlow    { 0%,100% { opacity:.62; transform:translate(-50%,-50%) scale(.98) } 50% { opacity:1; transform:translate(-50%,-50%) scale(1.06) } }
@keyframes hocTeamFlicker { 0%,100% { opacity:.5;  transform:translate(-50%,-50%) scale(1) }
                            28%     { opacity:.9;  transform:translate(-50%,-50%) scale(1.035) }
                            54%     { opacity:.62; transform:translate(-50%,-50%) scale(.99) }
                            78%     { opacity:.95; transform:translate(-50%,-50%) scale(1.05) } }
```
Respect `@media (prefers-reduced-motion: reduce)` → `animation:none`.

Ring: `border:4px solid #6b5222; box-shadow: 0 6px 18px rgba(0,0,0,.8), inset 0 0 24px rgba(0,0,0,.6), 0 0 0 3px #070503, 0 0 22px rgba(46,240,104,.28)` (static). Red team: swap the aura ramp to `rgba(255,90,70,…)` / `rgba(200,40,30,…)` and the ring's outer halo to `rgba(255,90,63,.28)`.

**Stone plate** — wraps the stat grid and the turn card: `padding:10px; radius:8px; background:linear-gradient(180deg, rgba(38,26,14,.92), rgba(16,11,6,.94)); border:2px solid #100b07; box-shadow: inset 0 0 0 1px rgba(150,130,98,.16), inset 0 2px 10px rgba(0,0,0,.75), 0 2px 6px rgba(0,0,0,.6)`.

**Stat cell** — every `StatItem` in its own recess: `padding:3px 6px; radius:5px; background:rgba(0,0,0,.32); box-shadow: inset 0 0 0 1px rgba(150,130,98,.14)`. Grid `repeat(metrics.statColumns, minmax(0,1fr))`, gaps 8px; icons the existing `ui/svg/*` at 22px; a stat with a modifier chip still spans two columns.

**Section titles** (Abilities / Buffs / Up next) — 0.8rem, 800, `letter-spacing:.12em`, uppercase, `#dcb158`, `text-shadow:0 1px 0 rgba(0,0,0,.8)`, then a 2px rule `linear-gradient(90deg, rgba(120,104,80,.5), transparent)`.

**Ability / buff tiles** — `metrics.abilityCell` / `metrics.effectIcon` sizes, `border:2px solid #0d0906`, `box-shadow: inset 0 0 0 1px rgba(150,130,98,.22), 0 2px 6px rgba(0,0,0,.7)`; auras circular, others `radius:15%`; stack-power pips unchanged.

**Unit name** — 1.02rem, 800, `letter-spacing:.03em`, `#f2e3c0`, `text-shadow:0 1px 0 rgba(0,0,0,.85)`.

**Turn card** — same plate; lap medallion `border:2px solid #6b5222; box-shadow: 0 0 0 1px rgba(0,0,0,.7), inset 0 1px 2px rgba(255,220,150,.16), 0 2px 5px rgba(0,0,0,.7)`; timer groove `border:1.5px solid #6b5222`, fill unchanged (`#f4f6f8 → #d5dbe3 52% → #a8b1bf`, red on the opponent's turn).

## 3. Combat toolbar (DraggableToolbar)

Obsidian discs, black rims, ember glyphs. Geometry unchanged (`45 * SCREEN_RATIO` = 63px buttons, 96px shell at 1080p).

- Shell: `padding:12px 8px; radius:14px; border:3px solid #0a0705; background:linear-gradient(180deg, rgba(28,20,12,.96), rgba(8,6,4,.96)); box-shadow: 0 6px 20px rgba(0,0,0,.75), inset 0 0 0 1px rgba(150,130,98,.2), inset 0 0 16px rgba(0,0,0,.6)`; children gap 16px.
- Drag handle: 6 dots, `rgba(220,177,88,.6)`. Rotate button at the bottom: 36px, `rgba(255,255,255,.5)`.
- Button (default): 63px circle, `background:radial-gradient(circle at 42% 32%, #2b2118, #120c07 70%)`, `border:2px solid #241a10`, `box-shadow: inset 0 2px 6px rgba(0,0,0,.9), 0 0 12px rgba(0,0,0,.5)`; glyph stroke `#f0d99a` at 32px (`stroke-width:2.4`).
- **Active / live action** (the one the player can take now): `radial-gradient(circle at 42% 32%, #3a2c1c, #1a1109 70%)`, `border:2px solid #8a7136`, `box-shadow: inset 0 2px 6px rgba(0,0,0,.8), 0 0 18px rgba(243,212,136,.4)`, glyph `#fff3d4`.
- **Disabled**: `radial-gradient(circle at 42% 32%, #201811, #0d0905 70%)`, `border:2px solid rgba(202,162,79,.35)`, `opacity:.5`, no glow.
- Hover: keep today's `scale(1.15)`; press `scale(0.95)`. Luck/clover glyph reads green `#8fd89a`; the AI button keeps its 11px/800 `AI` label in `#f0d99a`.

Glyph art in the reference is placeholder line-work — the shipping build should keep its own `icon_*_black.webp` atlas, recoloured/lit to the values above.

## 4. Unchanged on this screen
`MessageBox` CASE-2 content, `TurnTimerBar` internals, `UpNext`, `TeamAmountFlag`, `PlayRankedBadge`, `FightLog` (chrome only warmed: well border `rgba(90,74,52,.5)`), the Damage toggler layout, the board itself.

## 5. Assets
`assets/` = repo art (creature portraits, artifacts, augments, synergies). `assets/board_reference.jpg` is the user's own board screenshot, used only as a colour-matching backdrop in the reference file — **not** an asset to ship. Ability/buff artwork and toolbar glyphs are placeholders because `game/core/images/` isn't committed.
