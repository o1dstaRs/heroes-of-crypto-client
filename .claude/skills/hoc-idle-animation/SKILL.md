---
name: hoc-idle-animation
description: Create identity-preserving high-resolution standing idle loops for Heroes of Crypto creatures from canonical art and an optional 256x256 Sprite AI motion draft. Use for idle, standing, breathing, weight-shift, hover-in-place, or subtle ambient creature animation; do not use for walking, attacks, reactions, death, or static portraits.
---

# HOC Idle Animation

Create a seamless idle animation that makes the creature feel alive without turning the pose into locomotion or changing its identity. Treat any 256x256 Sprite AI result as a motion sketch only; final frames must be genuinely redrawn at the approved working resolution from the canonical creature art.

## Choose the mode

- **Calibration:** Use for the first jointly directed idle, for a new body-plan family, or when no approved production record captures the intended standing behavior. Read [references/idle-calibration.md](references/idle-calibration.md).
- **Production:** Use an approved idle production record for a sufficiently similar creature and proceed autonomously until a quality gate fails or a creature-specific choice exceeds the approved range.

Read [references/idle-runtime-contract.md](references/idle-runtime-contract.md) before packaging, replacing, or integrating runtime assets.

## Classify the body plan first

Choose the creature's support and locomotion family before choosing its idle language. Read [references/body-plan-idles.md](references/body-plan-idles.md) when starting a new family or deciding whether an existing production record is transferable.

- grounded bipeds;
- grounded quadrupeds;
- grounded multipeds;
- legless ground-supported or coiled creatures;
- rooted or planted creatures;
- flying or hovering creatures;
- wheeled, suspended, or mechanically supported creatures.

Do not transfer breathing amplitudes, anchors, contact rules, or secondary motion between families merely because two silhouettes look similar. The Peasant and Squire evidence currently calibrates **grounded bipeds**. Treat every other family as uncalibrated until an approved production record establishes its motion language.

## Establish the idle concept

Resolve the canonical full-body identity art, the existing runtime idle if present, and the creature's physical character. Choose an idle language appropriate to its body plan rather than applying human breathing universally:

- living grounded creatures may breathe and shift weight;
- armored or massive creatures should move with restrained inertia;
- constructs may use pressure, glow, vibration, or mechanical settling;
- plants may flex or sway around rooted contacts;
- undead may use intentionally unnatural stillness or irregular motion;
- flying creatures may hover around a stable body anchor.

Define the motion hierarchy before generation:

1. **Primary:** the main readable idle action, such as chest expansion, weight transfer, hover, or body sway.
2. **Secondary:** connected response in shoulders, head, hips, wings, tail, cloth, shield, or weapon.
3. **Tertiary:** restrained detail such as plume, hair, flame, glow, antennae, or fabric settling.

Keep the primary action readable at actual game scale. Secondary and tertiary motion must lag or counterbalance naturally rather than making every part move together.

## Workflow

1. Create a unique versioned work folder under `/Users/pro/Workplace/heroesofcrypto-assets/design`; never reuse an earlier calibration folder destructively.
2. Inventory and hash the highest-quality unclipped canonical creature art. If `<creature>_idle` already exists, save its atlas/meta, preview, hashes, dimensions, timing, anchor, and visible behavior as `runtime-before`.
3. Create or import the low-resolution idle draft when useful. Preserve raw Sprite AI GIF, atlas, JSON, settings, prompt, timing, and hashes. Compare all exported representations and reject corrupted or contradictory ones.
4. Approve or select a motion map: primary action, secondary responses, fixed contacts, stable anchor, extrema, duration, holds, and loop seam. Do not generate a full high-resolution sequence from an unapproved or visibly broken draft during calibration.
5. Redraw the neutral pose and the most displaced key pose at full working quality. Preserve face, anatomy, silhouette, costume, equipment, markings, material rendering, light direction, camera, scale, and orientation.
6. Redraw the complete connected creature in each frame. Prefer complete-frame redraws for bodies, armor, cloth, hands, straps, weapons, and shields. Layered transforms are allowed only for genuinely independent effects or clean anatomical layers that do not create seams, detached parts, or rigid puppet motion.
7. Normalize frames deterministically: identical canvas, stable camera, stable baseline or body anchor, clean alpha, consistent framing, and lexical frame order. Do not use globally scaled copies or blended ghost frames as final runtime art.
8. Build a numbered contact sheet, dark-background preview, light/checker alpha preview, neutral-versus-extreme comparison, and full loop at actual runtime display size. Inspect the loop seam and fragile details frame by frame.
9. During calibration, obtain approval for the motion concept, the neutral/extreme high-resolution pair, and the complete loop. In production, stop only for a material deviation or after three meaningfully different attempts fail the same gate.
10. Stage approved atlas/meta/preview outputs outside runtime. Back up the installed idle, request explicit replacement approval, promote safely, regenerate imports, and verify the board animation. Roll back the complete prior set if validation or scene playback fails.
11. Save a production record with source hashes, idle concept, motion hierarchy, fixed contacts, amplitudes, timing, prompts, transforms, corrections, approval evidence, QA results, and before/after runtime hashes.

## Quality gates

All gates must pass before runtime promotion:

- **Identity:** The same canonical creature, equipment, proportions, materials, palette, camera, and facing are preserved.
- **Standing behavior:** Ground contacts remain planted unless an approved characterful idle deliberately changes them; hovering creatures remain centered around the approved anchor. No accidental step, slide, teleport, or locomotion drift.
- **Apparent scale:** The creature does not pump larger or smaller because its camera, optical center, head size, or outer silhouette changes between frames. Intended anatomical expansion is local and measured, never a global zoom.
- **Motion quality:** The primary action has believable mass and rhythm; connected parts respond coherently; secondary motion does not overpower the pose.
- **Loop:** The end returns smoothly to the start without a pop, doubled terminal frame, unintended pause, speed jump, or visible reversal artifact.
- **Temporal coherence:** No flickering engravings, changing facial features, equipment morphing, detached grips, cloth discontinuities, alpha debris, camera drift, or scale pumping.
- **Resolution:** Final frames contain high-resolution redrawn detail, not enlarged 256x256 pixels or smeared interpolation.
- **Game fit:** The motion is visible but not distracting at runtime size, does not clip important parts, and uses the correct idle atlas/meta contract.

Do not call a candidate production-ready while any known gate fails.
