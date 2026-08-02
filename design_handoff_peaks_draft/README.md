# Handoff: Peaks-mode draft screens (Heroes of Crypto)

## Overview
The full pre-battle draft flow for peaks mode, redesigned end to end: starting bundle → four creature picks → tier-2 artifact → augments. Seven screens, all sharing one layout skeleton, one dark palette and one bottom progress rail.

## About the design files
The `.dc.html` files in this bundle are **design references written in HTML** — prototypes of the intended look and behaviour, not production code to lift. Recreate them inside the existing client (`heroes-of-crypto-client`, React + TypeScript) using its own components, state and styling conventions. Do not ship the HTML.

Open any file directly in a browser to inspect it (they need the sibling `support.js`, `_ds/` and `assets/` folders, which are included).

## Fidelity
**High fidelity.** Colors, type sizes, radii, spacing and interaction states are final. Match them pixel-for-pixel. Copy is final English copy.

## Screens

All screens share the same shell:
- Root: `min-height:100vh`, background `radial-gradient(120% 80% at 50% 0%, #171a23 0%, #0b0d12 60%)`, text `#e9e6df`, `max-width:1720px`, centred, `padding:132px 40px 36px`, `display:flex; flex-direction:column; gap:30px`. Authored at `zoom:0.9` — treat the values below as the design's own px units.
- H1: 62px/1, `#efe4cc`, centred. Optional 22px `#9aa0ab` subtitle under it.
- Confirm button (bottom, above the rail): min-height 132px, min-width `min(760px,92%)`, radius 16px, green gradient `#7ab86a → #4e9450 46% → #2f6b3c`, inset ring `rgba(214,240,200,.55)`, label 46px 700 uppercase `#f2fbee`, blinking (`hocBlink` 1.4s) until hovered. A vertical divider then a tabular-numerals timer; timer turns `#ff3b2f` with a red glow under 15s.
- Progress rail (bottom): 8 steps — Bundle, Lvl 1, Lvl 2, Lvl 3, Artifact 2, Lvl 4, Augments, Place. Chip 44×44, radius 14. Done = `✓`, border `#4e9450`, fill `rgba(78,148,80,.18)`, label `#8fcd7d`. Current = fill `#dcb158`, text `#241a06`, label `#efe4cc`. Pending = fill `#12151d`, border `rgba(255,255,255,.12)`, label `#7c8290`. Connectors: 2px `rgba(255,255,255,.14)`.

### 1. Bundle Step (`Bundle Step.dc.html`)
Title "Choose your starting bundle". Two bundle cards in an auto-fit grid (`minmax(420px,1fr)`, gap 40, container `min(82%,100%)` max 1410px). Card: `#12151d`, radius 36, 3px border `rgba(255,255,255,.12)`, padding 38/42/34; hover lifts 4px and borders `rgba(220,177,88,.55)`; selected = border `#dcb158`, glow `0 0 40px rgba(220,177,88,.28)`, fill `#171a23`. Each card holds two circular creature portraits (`min(210px,38vw)`, 4px border `rgba(220,177,88,.7)`) with name 24/700 and "Level N" 18px `#9aa0ab`, plus a tier-1 artifact strip (radius 26, fill `rgba(220,177,88,.08)`, border `rgba(220,177,88,.28)`, 137px art, gold 30/700 name, uppercase 17px kicker, 19px effect line).
Hovering a portrait shows a full-width stat panel absolutely positioned over the title area (`top:-46px`, width `min(1340px,97vw)`, radius 34, fill `rgba(11,13,18,.98)`, 2px border `rgba(159,182,212,.55)`): portrait, name + "Level N · Faction", a stat grid (`auto-fit minmax(112px,1fr)`, chips radius 16 on `rgba(255,255,255,.05)`), and ability tiles 96×96.

### 2–5. Pick Phase / L2 / L3 / L4 (`Pick Phase*.dc.html`)
Title "Pick a Level N creature". Below it, two army rails side by side:
- **Your army** — `#171a23`, radius 26, 2px `rgba(255,255,255,.12)`; gold 19/700 label; a "Scout" pill; filled slots 63×63 radius 18 with 2px `#dcb158`; empty slots dashed `rgba(255,255,255,.18)` labelled L1…L4; a 2px divider; then the T1 and T2 artifact slots.
- **Opponent** — `#241416`, radius 26, 2px `rgba(138,43,43,.6)`; label `#ff9d9d`; slots 54×54; unknown picks render `?`, scouted picks render the portrait, `👁` marks scout-revealed slots.

Creature grid: 2 columns, gap 26, padding 22, radius 30, fill `rgba(255,255,255,.025)`. Each column is a faction (Life / Nature / Chaos / Might) with a 16px uppercase `.14em` heading `#e0d3b0` and a 3-column portrait grid. Tile: square, radius 20, 3px `rgba(255,255,255,.18)`, hover lifts 5px; name 17/600 with small ability glyphs. **Banned/taken**: opacity .5, border `#8a2b2b`, portrait `grayscale(1)` with `x_mark_2_512.webp` overlaid, not clickable. Hovering any tile drives the shared stat panel (`#statpanel`, `data-slot` fields swapped from the `CREATURES` table in the logic class).
`opponentTurn` prop flips the confirm button to red (`#d1554a → #a3322b → #6e1f1a`), label "Opponent's turn", and disables picking — that's the alternating-turn state.

### 6. Artifact Step (`Artifact Step.dc.html`)
Title "Pick a Tier-2 artifact", subtitle "One of three. Both players choose at the same time — picks are revealed when the timer ends." Runs **after Lvl 3, before Lvl 4** (step 5 of 8) and is **simultaneous**, like the bundle step — no turn passing. Both army rails are shown; the player's T2 slot pulses gold (`hocPulse`), the opponent rail shows a blinking "T2 · choosing…" pill instead of a portrait. Three cards, auto-fit `minmax(400px,1fr)`, gap 30, same card chrome as bundles: 186px artwork, 32/700 gold name, 16px uppercase "Tier-2 artifact" kicker, then effect rows (radius 18, `rgba(255,255,255,.05)`, 20px text, Lucide-style 24px icon per row). On confirm the chosen artwork drops into the T2 slot and the cards lock.
Placeholder numbers — replace with the real values from `heroes-of-crypto-common`: Warlord's Edge (+1.5 base attack, +2 morale), Titan Plate (+18% armor, −0.5 speed), Clover of Fortune (+4 luck, +1 upgrade point).

### 7. Augment Step (`Augment Step.dc.html`)
Title "Choose your augments". Army rails on top, then one column per augment family (Board placement, Armor, Might, Movement, Sniper, Magic) as cards with a 256px family icon, the family name, and stacked options; each option row shows its label and its point cost, the selected row filling gold. Budget is spent from the upgrade-point pool shown in the header pill.

## Interactions
- **Pick → Confirm** two-step everywhere: clicking a card/tile only selects (gold border + glow); the green button commits. Button label cycles "Pick a …" → "Confirm <name>" → "<name> confirmed / locked in".
- Timer counts down once per second from `turnSeconds`; at 0 the pick should auto-submit (prototype just stops at 0:00).
- Hover on any creature (grid, bundle card, or army rail) opens the stat panel; it is `pointer-events:none` and closes on mouse-out.
- Transitions: `transform .12s ease` on cards/tiles. Keyframes `hocBlink` (1.4–1.8s opacity pulse) and `hocPulse` (expanding gold ring).
- Banned, taken and locked elements ignore clicks.

## State
Per screen: `left` (seconds), `picked` (name | null), `confirmed` (name | null); Pick Phase adds the `opponentTurn` prop. Real implementation additionally needs: the draft step, both armies, the ban/taken set, scouted-slot visibility, and the upgrade-point budget on the augment screen.

## Tokens
Backgrounds `#0b0d12`, `#12151d`, `#171a23`; opponent `#241416` / border `rgba(138,43,43,.6)`. Text `#e9e6df`, headings `#efe4cc`, muted `#9aa0ab`, disabled `#7c8290`. Gold `#dcb158` (dark text on gold `#241a06`). Green `#4e9450` / `#7ab86a` / `#2f6b3c`, success text `#8fcd7d`. Danger `#ff3b2f`, opponent text `#ff9d9d`, ban border `#8a2b2b`. Stat icons: hp `#ff4d4d`, damage `#f0b48a`, neutral `#c8ccd4`, magic `#b085e8`, speed `#7fa8e8`, luck `#5fc97a`.
Radii 14 / 16 / 18 / 20 / 26 / 30 / 34 / 36, pills 999. Gaps 6 / 10 / 12 / 14 / 20 / 22 / 26 / 30 / 40. Type 13, 14, 16, 17, 18, 19, 20, 22, 23, 24, 30, 32, 46, 62. Font: the design-system body face (`--font-body`); swap for the client's own UI font.

## Assets
`assets/` — 110 files taken from the client repo (`heroes-of-crypto-client`): `*_128.webp` creature portraits, `artifact_t1_*_256.webp` / `artifact_t2_*_256.webp`, `*_augment_256.webp`, `synergy_*_256.webp`, `x_mark_2_512.webp` (ban overlay), plus `index.json`. Use the repo originals rather than these copies. Stat and ability icons are inline SVG in the Lucide style at stroke-width 2.75.

## Files
`Bundle Step.dc.html`, `Pick Phase.dc.html`, `Pick Phase L2.dc.html`, `Pick Phase L3.dc.html`, `Pick Phase L4.dc.html`, `Artifact Step.dc.html`, `Augment Step.dc.html` — plus `support.js`, `_ds/` and `assets/`, which they load.
