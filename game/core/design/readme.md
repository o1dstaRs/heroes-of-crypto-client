# Heroes of Crypto — draft ("pick stage")

Design-system copy of the live draft screens, generated from the running game so a redesign can be done
against real data instead of placeholders.

## Pages

| File | What it is |
| --- | --- |
| `pick-screen.html` | The whole Level-1 pick step: phase rail, title, status chips, legend, 19-creature grid, both army strips |
| `creature-tile.html` | The tile component in all four states, at grid and card size, with the token table |
| `doctrine-step.html` | Step 0 — the three scouting doctrines |
| `bundle-step.html` | Step 1 — the two starting bundles (2 creatures + tier-1 artifact) |
| `draft-data.html` | Phase order and timers, doctrines, all 24 artifacts, all 63 creatures with stats, art-naming rules |
| `hoc-tokens.css` | Every colour/geometry token the pages use — the redesign entry point |
| `assets/` | Real portraits (`_128`), tier-1 artifact icons, and the painted ban stroke `x_mark_2_512.webp` |

## Where this lives in code

- Screen + tile: `game/core/src/ui/PickAndBan/index.tsx` (`CreatureTile`, `PerkPanel`, `PickPanel`, the legend)
- Legacy draft boxes still in use: `PickAndBan/RevealCreatureImageBox.tsx`, `PickAndBan/InitialCreatureImageBox.tsx`
- Map reveal + timer: `PickAndBan/MapReveal.tsx`, `PickAndBan/Timer.tsx`
- Draft state over SSE: `game/core/src/ui/context/PickBanContext.tsx`
- Phase order, actors, timers (authoritative): server `src/api/game/v1/settings/pick_phase_settings.ts`
- Data: common `src/configuration/creatures.json`, `src/perks/perk_properties.ts`, `src/artifacts/artifact_properties.ts`, `src/picks/pick_sim.ts`

## Constraints a redesign has to respect

1. **The server owns the phases.** 13 steps in a fixed order, each with a countdown; on timeout the pick
   daemon chooses for you. Any layout needs a permanently visible timer and "whose turn" state.
2. **Simultaneous vs single-actor steps.** Doctrine, bundle and the tier-2 artifact are answered by both
   players at once; every creature pick belongs to exactly one side.
3. **Scouting is a doctrine, not a toggle.** Opponent slots are hidden, revealed (eye) or known, depending
   on the doctrine picked at step 0. The opponent strip has to render all three.
4. **Level gating.** A pick step only accepts a creature of that level: L1 → L2 → L3 → L4, never out of order.
5. **Ban visual.** Banned and taken share one look: greyscale portrait, crimson ring, painted red stroke
   (`x_mark_2_512.webp`) on top. Do not put the greyscale filter on the wrapper or the stroke greys out too.
6. **Upgrade points** come from the doctrine (5/6/7) and are spent later, during placement — the draft only
   displays the budget.
