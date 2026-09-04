# First joint idle calibration

Use this process for the first end-to-end standing animation or whenever the target body plan requires a new idle language. The goal is to capture the user's visual judgment as reusable decisions without treating one creature's measurements as universal.

## Create the record

Create `/Users/pro/Workplace/heroesofcrypto-assets/design/<creature>_idle_calibration_vN`, choosing the next unused version. Keep the actual folders needed for:

- canonical identity source and hashes;
- untouched motion draft and Sprite AI export metadata;
- extracted draft frames;
- high-resolution key frames and final frames;
- previews and comparisons;
- `PROCESS.md` and `production-spec.json`;
- `runtime-before` when an idle already exists.

Do not replace the installed idle during calibration.

## Approval 1: idle concept and motion map

Present the current standing art or existing idle at game scale. Propose one or a few genuinely different idle concepts, such as restrained breathing, heavy weight settling, vigilant tension, rooted sway, mechanical pressure cycling, or hover drift. Avoid cosmetic variations of the same motion.

For the selected concept, record:

- body-plan family, support model, primary mass, and closest approved production record;
- primary, secondary, and tertiary motion;
- fixed ground contacts or stable body anchor;
- which joints and equipment may move;
- which details must remain still;
- neutral pose and maximum displacement;
- loop duration, holds, rhythm, and whether motion is symmetric or irregular;
- intended emotional read at runtime scale.

If Sprite AI is used, show its 256x256 loop for motion approval only. Compare GIF, PNG atlas, extracted frames, and JSON because exports may disagree. Low-resolution loss of identity is acceptable at this stage; broken anatomy, bad contacts, wrong equipment behavior, camera motion, or a poor loop is not.

### Sprite AI Animator entry

When using Sprite AI for the motion draft, enter through `https://www.sprite-ai.art/studio/animate`, not the character generator. Select `Idle`, then use `Pick a sprite` and upload a prepared motion-reference copy of the authoritative full-body battlefield source. Resolve the canonical source from the client runtime mapping for the named creature rather than choosing by a plausible filename or portrait appearance; record the mapping file, asset key, absolute source path, dimensions, alpha status, and SHA-256.

Sprite AI imports one still image in PNG, JPEG, or WebP format and requires every side to be between 16 and 256 pixels. Never resize or replace the canonical art in place. When either source dimension exceeds 256, create a separate lossless PNG motion reference with the longest side reduced to 256, uniform aspect-preserving scale, unchanged full canvas framing, no crop, no padding shift, no sharpening, and intact alpha. Use `scripts/prepare_sprite_ai_input.sh` and record the canonical-to-reference scale and offset. The 256px image is disposable motion input; reconstructing final identity detail from it is forbidden. All high-resolution redraws must refer back to the canonical source while borrowing only pose and motion coordinates from the draft.

After upload, capture the visible framing preview and all selected controls before changing them. Record the frame count, credit quote, prompt, framing anchor, and any automatic crop or scale. Treat credit counts and defaults as observed values, not permanent project rules. Do not press `Animate` during calibration until the uploaded identity, `Idle` mode, frame count, framing, and prompt have been reviewed.

For a restrained grounded idle, start with the built-in `Idle` preset and 8 frames. Describe identity, view, planted contacts, restrained primary motion, equipment constraints, and forbidden locomotion in concrete visual language. Prefer one coherent action over a list of competing gestures. Use `Custom` only when the built-in preset cannot preserve the required contacts or equipment behavior; custom motion wording is then the smallest necessary correction, not a wholesale redesign.

## Approval 2: neutral and extreme key frames

Redraw two complete full-quality frames:

1. the canonical neutral pose;
2. the frame with the largest approved displacement.

Show them beside the canonical source at matched scale and alternate between them. Ask the user to judge:

- creature identity and proportions;
- allowed deformation of chest, shoulders, abdomen, neck, wings, tail, cloth, or equipment;
- believable mass and pivot points;
- material and lighting consistency;
- whether the motion reads at actual game size without becoming distracting.

Freeze accepted identity wording, motion amplitude, camera, working size, fixed contacts, and exclusions before drawing the remaining frames.

## Approval 3: complete loop

Show all of the following:

- numbered high-resolution contact sheet;
- dark-background loop;
- light or checker-background loop;
- actual-size loop in a representative battlefield context;
- neutral/extreme comparison;
- close-ups of face, hands/grips, feet or anchor, equipment, and any fragile secondary motion;
- first/last seam inspection without duplicating the same pose merely to close the loop.

Record each correction with an observable reason. Keep creature-specific corrections in the production record. Promote a rule to the Skill only when it is reusable across multiple creatures or clearly prevents a known general failure.

## Known project evidence

Use these local examples as evidence, not as automatic production templates:

- `/Users/pro/Workplace/heroesofcrypto-assets/design/squire_idle_breathing_v1` — rejected layered puppet treatment with visible cut seams and disconnected vertical motion.
- `/Users/pro/Workplace/heroesofcrypto-assets/design/squire_idle_breathing_v2_redrawn` — complete-frame redraw approach with planted boots and a connected body/equipment redraw.

The Squire's frame count, 1.92-second duration, motion angles, breathing amplitude, and locked lower legs are creature-specific calibration results, not defaults for every creature.

## Grounded-biped lessons from Peasant iteration

Treat these as reusable failure prevention for humanlike grounded bipeds, not as numeric defaults for other families:

- **Breathe anatomically, not by zooming.** On inhale the chest widens locally and the upper torso rises or reclines slightly; on exhale it narrows and settles slightly forward. Never scale the whole frame to simulate breath.
- **Permit connected head motion but lock head geometry.** The head may follow the neck and spine, but its authored width, height, facial identity, and camera perspective must not change. Artificially pinning it in one pose looks detached; regenerating it at changing sizes creates scale pumping.
- **Measure more than the foot row.** Keep the support baseline fixed, then also compare pelvis position, optical center, alpha bounds, visible silhouette width and height, and apparent game-scale size. A frame can share the same bottom pixel while the body still jumps upward or sideways.
- **Move hands and equipment as one chain.** Shoulder, elbow, wrist, grip, second hand, shaft, and weapon head must advance through small coherent angular steps. Preserve grip order and avoid a weapon snapping to a new angle between adjacent frames.
- **Protect fragile weapon detail.** Inspect thin blades, tines, strings, tips, and shafts at native and runtime size. Keep them sharp, consistently shaped, clear of the canvas edge, and free of frame-to-frame disappearance.
- **Redraw real in-betweens.** Do not use global scaling, optical-flow smears, or blended ghost frames as final art. A hybrid is acceptable only when its transfer region is explicit, connected anatomy remains coherent, and pixel comparisons prove the untouched identity region stayed unchanged.
- **Inspect edges and alpha on contrasting backgrounds.** Reject white outlines, green spill, alpha debris, and contour flicker even when they are hard to see on the usual dark battlefield.

For grounded-biped QA, record per frame when practical: support baseline or both foot contacts, head bounding-box dimensions, full alpha bounds, visible-character bounds, optical center, minimum canvas-edge clearance, and any intentional local chest-width change. Compare adjacent frames and the first/last seam, not only extrema.

## Production record fields

Record at least:

```json
{
  "schemaVersion": 1,
  "status": "calibration|approved|runtime",
  "creature": "",
  "bodyPlanFamily": "grounded-biped|grounded-quadruped|grounded-multiped|legless-grounded|rooted|hovering|mechanically-supported|other",
  "supportModel": "",
  "idleKind": "breathing|weight-shift|hover|sway|mechanical|other",
  "sources": {
    "identity": { "path": "", "sha256": "", "selectionReason": "" },
    "motion": { "path": "", "sha256": "", "selectedRepresentation": "" },
    "runtimeBefore": { "paths": [], "sha256": [], "meta": {} }
  },
  "motionMap": {
    "primary": "",
    "secondary": [],
    "tertiary": [],
    "fixedContacts": [],
    "stableAnchor": "",
    "forbiddenMotion": [],
    "neutralFrame": 0,
    "extremeFrames": []
  },
  "spriteAI": {
    "used": false,
    "url": "https://www.sprite-ai.art/",
    "prompt": "",
    "settings": {},
    "frameSize": [0, 0],
    "frameDurationsMs": []
  },
  "redraw": {
    "method": "complete-frame|hybrid",
    "workingFrameSize": [0, 0],
    "identityPrompt": "",
    "lockedTraits": [],
    "allowedDeformations": []
  },
  "normalization": {
    "canvasSize": [0, 0],
    "baselineY": null,
    "bodyAnchor": null,
    "opticalCenterReference": null,
    "headBoundsReference": null,
    "targetCharacterBounds": [],
    "alphaMethod": ""
  },
  "export": {
    "frameCount": 0,
    "frameDurationsMs": [],
    "layout": { "cols": 0, "rows": 0 },
    "webp": "lossless|quality"
  },
  "approvals": [],
  "corrections": [],
  "qa": {},
  "outputs": {},
  "runtimeAfter": { "paths": [], "sha256": [] }
}
```

Approved records must contain real values and paths rather than empty placeholders.
