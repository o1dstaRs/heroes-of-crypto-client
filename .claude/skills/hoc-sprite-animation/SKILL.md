---
name: hoc-sprite-animation
description: Create or transfer active Heroes of Crypto creature sprite animations from a source creature image and a Sprite AI 256x256 motion draft, then redraw identity-preserving high-resolution frames, validate motion, and package atlas/meta files. Use for walking, attacks, reactions, death, or other active motion transfer; do not use for standing idle loops, breathing, hover-in-place, or static portraits.
---

# HOC Sprite Animation

Produce a clean high-resolution creature animation whose motion follows the approved draft and whose creature identity follows the canonical source art. Treat the 256x256 Sprite AI result as a motion reference, not as the source of final detail.

## Select the operating mode

- **Calibration:** Use when this animation family has no approved production record, when the user wants to work through the first example together, or when the requested result materially differs from prior examples. Read [references/calibration.md](references/calibration.md).
- **Production:** Use when an approved record already captures the relevant motion, redraw, normalization, and export decisions. Reuse that record and work autonomously until a deviation or failed quality gate requires a decision.

Before packaging or touching runtime assets, read [references/hoc-animation-contract.md](references/hoc-animation-contract.md).

## Required inputs

Resolve these from the task and local project before generating:

- canonical full-quality creature artwork;
- animation state and direction, including whether the sequence loops;
- motion source: a new Sprite AI run, a downloaded Sprite AI export, or an approved existing animation;
- target runtime contract or an approved production record.

Ask only for an input that cannot be discovered locally. If the creature, state, or direction is ambiguous enough to change the result, stop before spending generation calls.

## Workflow

1. Create a unique local design work folder under `/Users/pro/Workplace/heroesofcrypto-assets/design`; increment the version or add a timestamp if the proposed name already exists. Keep raw downloads, generation intermediates, rejected passes, and previews there; do not overwrite earlier calibration work or runtime assets.
2. Inventory the target creature before generating. Choose the highest-quality unclipped full-body canonical artwork as the identity source, record its hash, and record the current runtime atlas/meta hashes, frame count, timing, camera, direction, and anchors when an animation already exists.
3. Generate or import the Sprite AI motion draft. Preserve the raw GIF, atlas, JSON, prompts, settings, frame order, frame durations, and source hashes unchanged. Compare the GIF, atlas, extracted frames, and JSON; if they disagree or one representation contains decode/export artifacts, choose and record the visually valid motion source rather than propagating the artifacts. If the service is used through a signed-in browser, do not alter account settings or purchase credits without explicit authorization.
4. Review the motion before redrawing. Label each frame by action phase, support/contact limb, important silhouette, equipment arc, and foot or body anchor. Explicitly decide how body or equipment motion maps onto the target creature when their anatomy, handedness, or equipment differ. Reject broken anatomy, incorrect direction, duplicated phases, camera movement, or a bad loop before investing in high-resolution art.
5. Redraw at the working resolution required by the game. Use the canonical creature art for identity, equipment, palette, lighting, material detail, camera, and proportions. Use the low-resolution draft only for pose, timing, and motion arcs. A resampled upscale may be used as a guide but is never the final art.
   - **Exact-geometry redraw mode:** When the user explicitly says the draft motion is already correct and asks to redraw every frame along its existing boundaries, treat each draft frame as an immutable geometry mask rather than a loose pose reference. Do not use free generative redraw if it changes limb ownership, overlaps, negative spaces, contacts, or silhouette. Use deterministic learned super-resolution/restoration plus a restored source-derived alpha, enhance rendering only, and validate every final binary alpha mask against the integer-scaled source mask. Require mask IoU `1.0` and zero mismatched pixels before judging the loop. Preserve the draft's canvas-space motion and baseline changes instead of normalizing them away.
   - **Exact-geometry detail pass:** After the exact motion is approved, any additional quality pass must process opaque RGB separately and restore the approved alpha byte-for-byte. Prefer a realistic restoration/TTA pass for metal and material microcontrast plus a low-weight contour-stabilizing pass; do not introduce new ornaments. Validate byte-identical alpha for every frame, compare detail at close-up scale, and inspect the animated loop for texture flicker before requesting approval. A material-only generative edit that changes internal anatomy, armor construction, or pose is a rejection even if its standalone rendering looks better.
     - If the requested material quality needs a generative repaint, generate every frame separately from that exact frame plus the same canonical style reference, but treat each generated image only as an RGB material donor. Reproject the donor into the approved frame bounds, give the approved frame dominant weight on structural edges and uncovered areas, then restore the approved alpha byte-for-byte. Never substitute the free generative silhouette as the final geometry.
     - Inspect a numbered full-frame contact sheet and a dedicated legs/contacts close-up for every frame, then review the animated `last → first` seam. Bright donor RGB can reveal residual low-alpha pixels as halos; preserve or neutralize source RGB around translucent fringes before approval.
6. Prefer complete-frame redraws for connected bodies, armor, cloth, hands, and equipment. Use deterministic layered compositing only when clean anatomical layers exist and it does not create cut seams, rigid puppet motion, or inconsistent occlusion.
7. Normalize frames locally: identical canvas size, stable camera and scale, consistent baseline or body anchor, clean alpha, and deterministic frame order. Preserve the approved timing unless the runtime contract requires a deliberate, recorded conversion.
   - When the walk also needs a detached footstep VFX, keep it in a separate transparent atlas instead of painting it into the creature frames. Derive emissions from the approved support/contact phases of the distance-driven gait, alternate the lateral foot offset, and orient each emission from the projected direction of the current route segment. At a corner, use the new segment direction; do not interpolate one puff across the turn. Keep the VFX scoped to the explicitly approved creature until the user approves it as shared behavior, and disable any older generic trail for that creature to avoid double effects.
8. Build visual QA artifacts: contact sheet, animated preview on dark and light or checker backgrounds, motion-source comparison, and close-ups for hands, faces, feet, weapons, wings, tails, or other fragile details.
9. Apply the quality gates below. During calibration, obtain user approval at the motion draft, first high-resolution key frame, and full-loop stages. During production, stop only when the result falls outside an approved record or a gate cannot be met after three materially different attempts.
10. Package the approved frames as WebP atlas variants plus `*_meta.json`. Stage them outside the runtime folder, back up the currently installed atlas/meta into the design record, and request explicit replacement approval. Promote atomically where practical, verify installed hashes and in-game playback, and retain the backup until rollback is no longer needed.
11. Save a production record containing exact inputs, settings, prompts, transforms, user corrections, accepted deviations, before/after hashes, output paths, and QA results. Promote only genuinely reusable lessons into this skill; keep creature-specific measurements in that production record.

## Quality gates

All gates must pass before runtime promotion:

- **Identity:** Face, silhouette, anatomy, costume, equipment, markings, palette, material rendering, and proportions still read as the same canonical creature.
- **Motion:** Frame phases, contacts, weight transfer, arcs, direction, timing, and loop behavior match the approved motion reference.
- **Temporal coherence:** No detail flicker, equipment morphing, limb swaps, drifting camera, scale breathing, baseline jitter, or accidental background movement.
- **Image quality:** Final detail is genuinely redrawn at high resolution; there are no enlarged low-resolution pixels, smeared edges, chroma halos, holes, duplicate fragments, or alpha debris.
- **Game fit:** The creature remains readable at runtime size, important effects are not clipped, anchors are stable, and atlas/meta names and dimensions match the client contract.
- **Detached walk VFX:** Each puff begins at an actual support contact, follows the correct foot and path angle, remains below the body, fades before becoming a continuous trail, and never changes creature-frame geometry or cadence.
- **Evidence:** The production record identifies the approved preview and records any user-approved exception.

Do not describe a candidate as production-ready while any gate is known to fail.
